/**
 * Server entry point for the postgres package.
 *
 * Connects to PostgreSQL, registers the AFS provider, and exports
 * the Postgres namespace with Collection class and utilities.
 */

import { PostgresStreamProvider } from './postgres_stream_provider';
import { ResolvedSchema, quoteIdent } from './schema';
import { compileSelector, compileModifier, compileSort } from './sql_compiler';

const { AFS } = Package.afs;

// Resolve connection URL. The Meteor tool injects POSTGRES_URL='no-postgres-server'
// as a sentinel when the app doesn't include the `postgres-dev-server` package
// (mirroring 'no-mongo-server'); treat it the same as no URL configured.
const _envUrl = process.env.POSTGRES_URL;
const url =
  (_envUrl && _envUrl !== 'no-postgres-server' ? _envUrl : null) ||
  (Meteor.settings &&
    Meteor.settings.packages &&
    Meteor.settings.packages.postgres &&
    Meteor.settings.packages.postgres.url) ||
  null;

let _provider = null;
// Set by the Meteor.startup block if connect() throws. Used by the
// Collection constructor / query shim to surface startup failures at first
// use instead of silently continuing with a half-initialized provider.
let _connectFailed = null;

if (url) {
  _provider = new PostgresStreamProvider(url);
}

function _throwIfStartupFailed() {
  if (_connectFailed) {
    const err = new Error(
      `Postgres connection failed at startup: ${_connectFailed.message}. ` +
      'Fix the connection config and restart.'
    );
    err.cause = _connectFailed;
    throw err;
  }
}

let _lastQueryDeprecationWarnAt = 0;
const _QUERY_DEPRECATION_WARN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Postgres namespace — top-level API.
 */
Postgres = {
  Collection: class PostgresCollection extends AFS.Collection {
    constructor(name, options = {}) {
      _throwIfStartupFailed();

      if (!_provider) {
        throw new Error(
          'Postgres: No connection URL configured. Set POSTGRES_URL environment variable ' +
          'or Meteor.settings.packages.postgres.url'
        );
      }

      // Normalize the schema now (catches type errors before super()), then
      // strip the `schema` option from what we forward to super() — AFS.Collection
      // does not know what to do with it.
      let schema = null;
      if (options.schema) {
        // Pass through sortHints if the caller supplied them alongside `schema`.
        const sortHints = options.sortHints || undefined;
        schema = new ResolvedSchema(options.schema, { sortHints });
      }

      const forwardOptions = { ...options };
      delete forwardOptions.schema;
      delete forwardOptions.sortHints;

      super(name, { provider: _provider, ...forwardOptions });

      if (schema) {
        // Use the public registerSchema API rather than poking `_schemas` directly.
        // registerSchema is async and handles both the schema map and (if already
        // connected) the DDL. We can't await here because super() must run first
        // and the constructor is sync — so we fire-and-forget. `ensureTable` in
        // the CRUD paths will self-heal if this races a first insert.
        _provider.registerSchema(name, schema).catch(e => {
          Log.error(`Postgres: Failed to register schema for "${name}":`, e);
        });
      }
    }
  },

  // Utilities
  getProvider: () => _provider,
  rawPool: () => _provider ? _provider.rawDatabase() : null,

  // Raw SQL entry point. Renamed from Postgres.query; the old name remains
  // as a deprecation shim below. This bypasses Meteor-level safety guarantees
  // (ACLs, schema conversion, reactive notifications) — caller beware.
  _query: (sql, params) => {
    _throwIfStartupFailed();
    if (!_provider || !_provider._connection) {
      throw new Error('Postgres: Not connected');
    }
    return _provider._connection.query(sql, params);
  },

  // Deprecated alias for Postgres._query. Warns once per process, then
  // delegates. Remove in a future major release.
  query: (sql, params) => {
    const now = Date.now();
    if (now - _lastQueryDeprecationWarnAt > _QUERY_DEPRECATION_WARN_INTERVAL_MS) {
      _lastQueryDeprecationWarnAt = now;
      Meteor._debug(
        'Postgres.query is deprecated; use Postgres._query for raw SQL. ' +
        'This bypasses Meteor-level safety guarantees.'
      );
    }
    return Postgres._query(sql, params);
  },

  // Test hooks. `_testSetConnectFailed` mirrors the name Tinytest uses in
  // postgres-tests.js regression tests — kept at the top level (single
  // underscore prefix) to match Meteor convention for test-only hooks.
  // The `_internal` mirror stays for anyone who was accessing it there.
  _testSetConnectFailed: (err) => { _connectFailed = err; },
  _testGetConnectFailed: () => _connectFailed,

  _internal: {
    compileSelector,
    compileModifier,
    compileSort,
    ResolvedSchema,
    quoteIdent,
    testSetConnectFailed: (err) => { _connectFailed = err; },
    testGetConnectFailed: () => _connectFailed,
  },
};

// Connect on startup
Meteor.startup(async () => {
  if (!_provider) {
    // No URL configured — skip connection
    return;
  }

  try {
    await _provider.connect();
    AFS.registerProvider('postgres', _provider);

    // Create any tables for schemas registered before connection
    for (const [name, schema] of _provider._schemas) {
      await _provider._connection.ensureTable(name, schema);
    }
  } catch (e) {
    // Latch the failure so first-use of a collection / Postgres._query
    // surfaces a hard error instead of silently no-oping.
    _connectFailed = e;
    Log.error('Postgres: Failed to connect:', e);
  }
});
