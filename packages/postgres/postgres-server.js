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

// Resolve connection URL
const url =
  process.env.POSTGRES_URL ||
  (Meteor.settings &&
    Meteor.settings.packages &&
    Meteor.settings.packages.postgres &&
    Meteor.settings.packages.postgres.url) ||
  null;

let _provider = null;

if (url) {
  _provider = new PostgresStreamProvider(url);
}

/**
 * Postgres namespace — top-level API.
 */
Postgres = {
  Collection: class PostgresCollection extends AFS.Collection {
    constructor(name, options = {}) {
      if (!_provider) {
        throw new Error(
          'Postgres: No connection URL configured. Set POSTGRES_URL environment variable ' +
          'or Meteor.settings.packages.postgres.url'
        );
      }

      let schema = null;
      if (options.schema) {
        schema = new ResolvedSchema(options.schema);
        // registerSchema is async but we need it before super()
        // Table creation will be deferred to first operation or Meteor.startup
        _provider._schemas.set(name, schema);
      }

      super(name, { provider: _provider, ...options });

      // Ensure table is created async
      if (schema && _provider._connection && _provider._connection.isConnected()) {
        _provider._connection.ensureTable(name, schema).catch(e => {
          Log.error(`Postgres: Failed to create table "${name}":`, e);
        });
      }
    }
  },

  // Utilities
  getProvider: () => _provider,
  rawPool: () => _provider ? _provider.rawDatabase() : null,
  query: (sql, params) => {
    if (!_provider || !_provider._connection) {
      throw new Error('Postgres: Not connected');
    }
    return _provider._connection.query(sql, params);
  },

  // Exposed for testing
  _compileSelector: compileSelector,
  _compileModifier: compileModifier,
  _compileSort: compileSort,
  _ResolvedSchema: ResolvedSchema,
  _quoteIdent: quoteIdent,
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
    Log.error('Postgres: Failed to connect:', e);
  }
});
