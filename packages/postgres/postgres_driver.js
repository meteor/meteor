/**
 * PostgresConnection — wraps pg.Pool for connection management,
 * table creation, and LISTEN/NOTIFY infrastructure.
 */

import { quoteIdent, quoteLiteral } from './schema';
import { ReconnectLoop, SubscriptionRegistry } from 'meteor/afs';
import { EventEmitter } from 'events';

const readPositiveIntEnv = (name, defaultValue, floor = 0) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < floor) return defaultValue;
  return n;
};

/**
 * PostgreSQL's NAMEDATALEN is 64, so identifiers/channels are silently
 * truncated at 63 bytes. The longest derived identifier we emit is the
 * trigger name:
 *
 *   `meteor_pg_` (10) + collectionName + `_notify_trigger` (15) = 25 + N
 *
 * So N ≤ 38 bytes guarantees no truncation of the trigger, function, or
 * channel name — and therefore no post-truncation collision between two
 * collections with long similar prefixes.
 *
 * The previous cap of 53 correctly bounded the channel (`meteor_pg_<N>`,
 * 10 + N ≤ 63 → N ≤ 53) but NOT the trigger name, so a 53-byte collection
 * name would still produce a 78-byte trigger identifier that Postgres
 * silently truncates.
 */
export const MAX_COLLECTION_NAME_BYTES = 38;

/**
 * Validate that a collection name fits within Postgres identifier/channel limits.
 * Throws a clear error naming the offending collection and the limit.
 * @param {string} collectionName
 */
function assertCollectionNameFits(collectionName) {
  const byteLength = Buffer.byteLength(collectionName, 'utf8');
  if (byteLength > MAX_COLLECTION_NAME_BYTES) {
    throw new Error(
      `Postgres: collection name "${collectionName}" is ${byteLength} bytes; ` +
      `must be <= ${MAX_COLLECTION_NAME_BYTES} bytes (UTF-8) to avoid PostgreSQL ` +
      `identifier truncation (NAMEDATALEN = 64) which would cause LISTEN channel ` +
      `or trigger-name collisions between collections.`
    );
  }
}

export class PostgresConnection extends EventEmitter {
  /**
   * @param {string} url - PostgreSQL connection URL
   * @param {Object} [options]
   */
  constructor(url, options = {}) {
    super();
    // Finite maxListeners: default 1024, overridable via env, floor of 64.
    // Avoids the "possible EventEmitter memory leak" warning being silenced
    // entirely (0 = unlimited) while still allowing many concurrent
    // subscribers to attach listen:* / callback-error handlers.
    const maxListeners = Math.max(
      64,
      readPositiveIntEnv('METEOR_POSTGRES_LISTEN_MAX_LISTENERS', 1024, 1)
    );
    this.setMaxListeners(maxListeners);
    this._url = url;
    this._options = options;

    this._poolMax = options.max !== undefined
      ? options.max
      : readPositiveIntEnv('METEOR_POSTGRES_POOL_MAX', options.poolSize || 10, 1);
    this._poolIdleTimeoutMs = options.idleTimeoutMillis !== undefined
      ? options.idleTimeoutMillis
      : readPositiveIntEnv('METEOR_POSTGRES_POOL_IDLE_TIMEOUT_MS', options.idleTimeout || 30000, 0);
    this._poolConnectionTimeoutMs = options.connectionTimeoutMillis !== undefined
      ? options.connectionTimeoutMillis
      : readPositiveIntEnv('METEOR_POSTGRES_POOL_CONNECT_TIMEOUT_MS', options.connectionTimeout || 5000, 0);

    this._pool = null;
    this._listenClient = null;
    this._knownTables = new Set();
    this._notifyCallbacks = new Map(); // channel -> Set of callbacks
    this._warnedUnknownTables = new Set();
    this._connected = false;

    // Serialize LISTEN/UNLISTEN per channel through a SubscriptionRegistry.
    // The provider passes its own registry instance via the `subscriptions`
    // option so dropCollectionAsync (at the provider layer) and setup /
    // remove (here) share a single per-channel queue — without this they
    // would be independent queues and a concurrent setup vs drop on the
    // same channel could interleave. When constructed without a registry
    // (e.g. unit tests that drive the connection directly) we instantiate
    // our own — fine in isolation, but provider code paths must pass one
    // through to keep the unified-serialization contract.
    this._subscriptions = options.subscriptions || new SubscriptionRegistry();

    // Shutdown flag + active ReconnectLoop reference so close() can abort an
    // in-flight LISTEN-client reconnect cleanly. Backoff/jitter/event vocab
    // live in afs's ReconnectLoop; this flag short-circuits before the loop
    // even starts when close() races a connection drop.
    this._shutdown = false;
    this._listenReconnectLoop = null;

    // Lazy-load pg to avoid issues during package load
    this._pg = null;
  }

  _getPg() {
    if (!this._pg) {
      this._pg = Npm.require('pg');
    }
    return this._pg;
  }

  /**
   * Establish connection pool and verify with a test query.
   */
  async connect() {
    const { Pool } = this._getPg();

    this._pool = new Pool({
      connectionString: this._url,
      max: this._poolMax,
      idleTimeoutMillis: this._poolIdleTimeoutMs,
      connectionTimeoutMillis: this._poolConnectionTimeoutMs,
    });

    // pg.Pool emits 'error' on idle-client failures (TCP RST, server
    // restart, PgBouncer idle-kill). Without a listener, Node routes
    // unhandled 'error' events to uncaughtException and the process
    // exits — the single most common prod crash mode for node-postgres.
    // Re-emit as 'pool-error' so callers that care (health checks,
    // metrics) can subscribe.
    this._pool.on('error', (err) => {
      try {
        Log.warn('Postgres: idle pool client error: ' +
          (err && err.message ? err.message : err));
      } catch (logErr) {
        // Log may be unavailable in some harnesses.
      }
      this.emit('pool-error', err);
    });

    // Verify connection
    const client = await this._pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    this._connected = true;
    Log.info('Postgres: connected to ' + this._url.replace(/\/\/[^@]*@/, '//***@'));
    this.emit('connected');
  }

  /**
   * Drain the pool and close all connections.
   */
  async close() {
    // Mark shutdown first so any in-flight reconnect loop sees the flag on
    // its next iteration and exits instead of re-acquiring a client from a
    // pool we're about to end.
    this._shutdown = true;
    if (this._listenReconnectLoop) {
      try { this._listenReconnectLoop.stop(); } catch (e) { /* ignore */ }
      this._listenReconnectLoop = null;
    }

    if (this._listenClient) {
      const client = this._listenClient;
      this._listenClient = null;
      try {
        await client.end();
      } catch (e) {
        // Ignore end errors on close
      }
    }

    if (this._pool) {
      await this._pool.end();
      this._pool = null;
    }

    this._connected = false;
    // Emit BEFORE clearing so `disconnected` handlers can still inspect
    // _knownTables / _notifyCallbacks to decide how to react (e.g. metrics:
    // "how many observers were live at teardown?"). Clearing afterward is
    // still required — any post-emit access via a later method call sees
    // an empty state, consistent with "closed". The SubscriptionRegistry
    // is owned by the provider and is intentionally NOT cleared here.
    this.emit('disconnected');
    this._knownTables.clear();
    this._notifyCallbacks.clear();
  }

  /**
   * Execute a parameterized query.
   * @param {string} text - SQL with $N placeholders
   * @param {any[]} [params]
   * @returns {Promise<{rows: Object[], rowCount: number}>}
   */
  async query(text, params) {
    if (!this._pool) throw new Error('PostgresConnection is not connected');
    this._warnIfUnregisteredTables(text);
    return this._pool.query(text, params);
  }

  /**
   * Internal query path for compiler-generated SQL that always references
   * known (registered) tables. Skips `_warnIfUnregisteredTables`, whose
   * whole-text regex scan would otherwise run on every CRUD call even in
   * dev. Public-facing raw SQL should continue to use `query()`.
   * @param {string} text - SQL with $N placeholders
   * @param {any[]} [params]
   * @returns {Promise<{rows: Object[], rowCount: number}>}
   */
  async _queryInternal(text, params) {
    if (!this._pool) throw new Error('PostgresConnection is not connected');
    return this._pool.query(text, params);
  }

  /**
   * Best-effort scan for plain collection-name references in a raw SQL
   * string. Warns (but does NOT block) if any look-alike identifier has
   * never been registered via ensureTable(). This helps catch typos /
   * missing schemas in user-supplied SQL without punishing legitimate raw
   * SQL against foreign tables.
   * @param {string} text
   * @private
   */
  _warnIfUnregisteredTables(text) {
    if (typeof text !== 'string' || text.length === 0) return;
    // Development-only by default: in production the regex-based scan costs
    // per-query CPU for a warning most apps will never see. Explicit opt-in
    // via METEOR_POSTGRES_WARN_UNKNOWN_TABLE=1 lets staging/canary servers
    // re-enable it without a code change. (METEOR_POSTGRES_SUPPRESS_…
    // still works for backward compatibility.)
    const explicitOptIn =
      process.env.METEOR_POSTGRES_WARN_UNKNOWN_TABLE === '1';
    const suppress =
      process.env.METEOR_POSTGRES_SUPPRESS_UNKNOWN_TABLE_WARN === '1';
    const isDev =
      (typeof Meteor !== 'undefined' && Meteor.isDevelopment) ||
      process.env.NODE_ENV === 'development';
    if (suppress) return;
    if (!isDev && !explicitOptIn) return;
    // Each regex is anchored to a keyword and captures the first identifier
    // (optionally double-quoted). Case-insensitive + global.
    const patterns = [
      /\bFROM\s+"?(\w+)"?/gi,
      /\bUPDATE\s+"?(\w+)"?/gi,
      /\bINSERT\s+INTO\s+"?(\w+)"?/gi,
      /\bDELETE\s+FROM\s+"?(\w+)"?/gi,
    ];
    const seen = new Set();
    for (const re of patterns) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const name = m[1];
        if (!name || seen.has(name)) continue;
        seen.add(name);
        // Skip schema-qualified ("schema.table" would be split across tokens),
        // system tables, and anything already registered.
        if (name.startsWith('pg_')) continue;
        if (name.toLowerCase() === 'information_schema') continue;
        if (this._knownTables.has(name)) continue;
        // A dot immediately after the match indicates a schema qualifier
        // like `public.users` — we captured `public`, which isn't a
        // collection name; skip.
        const after = text.slice(re.lastIndex, re.lastIndex + 1);
        if (after === '.') continue;
        if (this._warnedUnknownTables.has(name)) continue;
        this._warnedUnknownTables.add(name);
        try {
          Meteor._debug(
            `Postgres: table "${name}" is not registered as a Meteor collection. ` +
            `If this is intentional raw SQL this warning can be ignored.`
          );
        } catch (e) {
          // Meteor._debug may not be available in every test harness; fail silent.
        }
      }
    }
  }

  /**
   * Get a client from the pool (for transactions).
   * Caller MUST call client.release() when done.
   * @returns {Promise<Object>} pg Client
   */
  async getClient() {
    if (!this._pool) throw new Error('PostgresConnection is not connected');
    return this._pool.connect();
  }

  /**
   * Get the raw pg.Pool instance.
   * @returns {Object}
   */
  getPool() {
    return this._pool;
  }

  /**
   * Ensure a table exists with the given schema.
   * Skips DDL if the table is already known.
   *
   * @param {string} collectionName
   * @param {import('./schema').ResolvedSchema} schema
   */
  async ensureTable(collectionName, schema) {
    // Validate collection name fits PostgreSQL identifier limits before
    // building any DDL — prevents silent truncation collisions.
    assertCollectionNameFits(collectionName);

    if (this._knownTables.has(collectionName)) return;

    const columnDefs = ['_id TEXT PRIMARY KEY'];

    if (schema) {
      columnDefs.push(...schema.getColumnDefinitions());
    }

    columnDefs.push("_extra JSONB DEFAULT '{}'::jsonb");

    const ddl = `CREATE TABLE IF NOT EXISTS ${quoteIdent(collectionName)} (\n  ${columnDefs.join(',\n  ')}\n)`;

    await this._queryInternal(ddl);
    this._knownTables.add(collectionName);
  }

  /**
   * Set up LISTEN/NOTIFY trigger for a table.
   *
   * Installs a per-table trigger function that sends pg_notify on
   * INSERT/UPDATE/DELETE, then LISTENs on a dedicated connection.
   *
   * @param {string} collectionName
   * @param {Function} callback - Called on notification with { operation, id }
   */
  async setupListenNotify(collectionName, callback) {
    // Validate at the earliest entry point — before any SQL is built or any
    // callback is registered — to guarantee channel uniqueness post-truncation.
    assertCollectionNameFits(collectionName);

    const channel = `meteor_pg_${collectionName}`;
    const quotedChannel = quoteLiteral(channel);

    // Create trigger function if not exists
    const triggerFnName = `${channel}_notify_fn`;
    const triggerName = `${channel}_notify_trigger`;
    const quotedTriggerName = quoteLiteral(triggerName);

    // SET search_path = pg_catalog, pg_temp on the function so a caller
    // with a hostile search_path can't shadow pg_notify / jsonb_build_object
    // with their own functions in a user schema. Built-ins are also
    // fully-qualified as defense in depth.
    const fnSql = `
      CREATE OR REPLACE FUNCTION ${quoteIdent(triggerFnName)}()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM pg_catalog.pg_notify(${quotedChannel}, pg_catalog.jsonb_build_object('op', TG_OP, 'id', OLD._id)::text);
          RETURN OLD;
        ELSE
          PERFORM pg_catalog.pg_notify(${quotedChannel}, pg_catalog.jsonb_build_object('op', TG_OP, 'id', NEW._id)::text);
          RETURN NEW;
        END IF;
      END;
      $$;
    `;

    const triggerSql = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = ${quotedTriggerName}
        ) THEN
          CREATE TRIGGER ${quoteIdent(triggerName)}
          AFTER INSERT OR UPDATE OR DELETE ON ${quoteIdent(collectionName)}
          FOR EACH ROW EXECUTE FUNCTION ${quoteIdent(triggerFnName)}();
        END IF;
      END;
      $$;
    `;

    // Serialize with any in-flight LISTEN/UNLISTEN/drop for this same
    // channel through the shared SubscriptionRegistry. The `shouldListen`
    // check, callback-set mutation, trigger DDL, and LISTEN SQL must all
    // run atomically with respect to other channel ops — otherwise a
    // concurrent removeListenNotify (or dropCollectionAsync at the
    // provider layer) can delete the callback set between our check and
    // our LISTEN, or vice versa.
    await this._subscriptions.run(channel, async () => {
      const shouldListen = !this._notifyCallbacks.has(channel);
      if (shouldListen) {
        const client = await this.getClient();
        try {
          await client.query('BEGIN');
          await client.query(fnSql);
          await client.query(triggerSql);
          await client.query('COMMIT');
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            Log.error('Postgres: rollback failed after trigger/function setup error:', rollbackError);
          }
          throw error;
        } finally {
          client.release();
        }

        this._notifyCallbacks.set(channel, new Set());
      }
      this._notifyCallbacks.get(channel).add(callback);

      // Set up LISTEN on dedicated client (once)
      await this._ensureListenClient();
      if (shouldListen) {
        await this._listenClient.query(`LISTEN ${quoteIdent(channel)}`);
      }
      this.emit('listen:ready', { channel, collectionName });
    });
  }

  /**
   * Ensure the dedicated LISTEN client is set up.
   */
  async _ensureListenClient() {
    if (this._listenClient) return;

    const { Client } = this._getPg();
    const client = new Client({
      connectionString: this._url,
      connectionTimeoutMillis: this._poolConnectionTimeoutMs,
    });
    await client.connect();
    this._listenClient = client;
    this._attachListenClientHandlers(this._listenClient);
  }

  /**
   * Reconnect the LISTEN client with exponential backoff.
   * Re-subscribes to all active LISTEN channels.
   *
   * Implementation: delegates the loop / backoff / cancellable sleep to
   * afs's `ReconnectLoop`. Postgres-specific work — building a `pg.Client`,
   * re-LISTENing every channel, mapping events onto the existing
   * `listen:*` vocabulary — stays in the callbacks below.
   *
   * @private
   */
  async _reconnectListenClient() {
    if (!this._connected) return; // Pool is closed, give up
    if (this._shutdown) return;
    if (this._listenClient) return; // Already reconnected
    if (this._listenReconnectLoop) return; // Already running

    const maxAttempts = Math.max(
      1,
      readPositiveIntEnv('METEOR_POSTGRES_MAX_RECONNECT_ATTEMPTS', 10, 1)
    );

    const { Client } = this._getPg();
    let replayedChannels = [];
    let attemptNumber = 0;

    const loop = new ReconnectLoop({
      doReconnect: async () => {
        attemptNumber += 1;
        if (!this._connected || this._shutdown) {
          loop.stop();
          return;
        }
        if (this._listenClient) return; // raced; treat as success

        let client = null;
        try {
          client = new Client({
            connectionString: this._url,
            connectionTimeoutMillis: this._poolConnectionTimeoutMs,
          });
          await client.connect();

          if (this._shutdown) {
            try { await client.end(); } catch (e) { /* ignore */ }
            loop.stop();
            return;
          }

          this._listenClient = client;
          this._attachListenClientHandlers(this._listenClient);

          // Re-LISTEN all channels and collect them so observers can re-poll.
          replayedChannels = [];
          for (const channel of this._notifyCallbacks.keys()) {
            await this._listenClient.query(`LISTEN ${quoteIdent(channel)}`);
            replayedChannels.push(channel);
          }
        } catch (e) {
          if (client && this._listenClient !== client) {
            try { await client.end(); } catch (endErr) { /* ignore */ }
          }
          throw e;
        }
      },
      // Map afs's generic events onto the postgres `listen:*` vocabulary.
      // The `listen:reconnect-attempt` event carries the SAME `{attempt,
      // delay}` ReconnectLoop reports for its next sleep — no separate
      // `Math.random()` draw at this layer (which would shadow the actual
      // sleep with a different jittered value and produce misleading logs).
      onEvent: (evt, payload) => {
        if (evt === 'reconnecting') {
          this.emit('listen:reconnecting');
        } else if (evt === 'attempt') {
          // payload = { attempt, delay } from ReconnectLoop. Forward as
          // listen:reconnect-attempt with `delayMs` for backward compat
          // with callers that read the old field name.
          if (payload && payload.attempt > 1) {
            // Skip the first attempt's "about to sleep 0ms" notice — the
            // legacy implementation only logged AFTER a failure. Surface
            // attempts 2..N which is when a sleep actually occurs.
            Log.warn('Postgres: LISTEN reconnect retry (attempt ' +
              payload.attempt + '/' + maxAttempts +
              '), sleeping ' + payload.delay + 'ms');
            this.emit('listen:reconnect-attempt', {
              attempt: payload.attempt,
              delayMs: payload.delay,
            });
          }
        } else if (evt === 'success') {
          this.emit('listen:reconnected', { channels: replayedChannels });
        } else if (evt === 'gave-up') {
          // Single emit point for `listen:gave-up`, symmetrical with the
          // other onEvent cases. The catch-block below performs cleanup
          // (tear down listener state) but does NOT re-emit — emitting from
          // both places risked double-fires if a future onEvent handler
          // also routed 'gave-up'.
          this.emit('listen:gave-up', {
            attempts: payload && payload.attempts !== undefined
              ? payload.attempts
              : maxAttempts,
            error: payload ? payload.error : null,
          });
        }
      },
      backoff: {
        // Schedule mirrors the prior implementation: 1000, 2000, 4000, ...
        // capped at 30000ms. ReconnectLoop sleeps with its own jitter draw
        // from the same [0.5x, 1.5x] range as the legacy code.
        initialMs: 1000,
        maxMs: 30000,
        factor: 2,
        // 0.5 jitter centered on 1.0 -> [0.5x, 1.5x] of base.
        jitter: 0.5,
        maxAttempts,
        immediateFirst: true,
      },
    });

    this._listenReconnectLoop = loop;
    try {
      await loop.start();
    } catch (lastError) {
      // Exhausted retries — tear down listener state so observers can decide
      // whether to fall back to polling-only mode. The `listen:gave-up`
      // event has already been emitted via onEvent's 'gave-up' case;
      // emitting again here would double-fire to consumers.
      this._notifyCallbacks.clear();
      if (this._listenClient) {
        const c = this._listenClient;
        this._listenClient = null;
        try { await c.end(); } catch (e) { /* ignore */ }
      }
    } finally {
      if (this._listenReconnectLoop === loop) this._listenReconnectLoop = null;
    }
  }

  /**
   * Attach shared LISTEN client handlers for notifications and reconnects.
   * @param {Object} client - pg client used for LISTEN/NOTIFY
   */
  _attachListenClientHandlers(client) {
    client.on('notification', (msg) => {
      const callbacks = this._notifyCallbacks.get(msg.channel);
      if (!callbacks) {
        return;
      }

      let payload;
      try {
        payload = JSON.parse(msg.payload);
      } catch (e) {
        payload = { op: 'UNKNOWN', id: null };
      }

      for (const cb of callbacks) {
        try {
          cb(payload);
        } catch (e) {
          Log.error('Postgres LISTEN callback error:', e);
          // Emit a signal so observers (and tests) can detect swallowed
          // callback failures — without this event, a subscriber whose
          // callback dies mid-reconnect can end up silently stuck with
          // only a log entry.
          this.emit('listen:callback-error', {
            channel: msg.channel,
            error: e,
            payload,
          });
        }
      }
    });

    client.on('error', (err) => {
      Log.error('Postgres LISTEN client error:', err);
      if (this._listenClient !== client) {
        try { client.end(); } catch (e) { /* ignore */ }
        return;
      }

      this._listenClient = null;
      try { client.end(); } catch (e) { /* ignore */ }
      this.emit('listen:lost', { error: err });
      this._reconnectListenClient();
    });
  }

  /**
   * Remove LISTEN for a channel.
   * @param {string} collectionName
   * @param {Function} callback
   */
  async removeListenNotify(collectionName, callback) {
    const channel = `meteor_pg_${collectionName}`;
    // Serialize with any in-flight LISTEN/UNLISTEN/drop for this channel
    // through the shared SubscriptionRegistry so the callback-set mutation,
    // the emptiness check, and the UNLISTEN SQL are atomic relative to a
    // concurrent setupListenNotify (or dropCollectionAsync) on the same
    // channel.
    await this._subscriptions.run(channel, async () => {
      const callbacks = this._notifyCallbacks.get(channel);
      if (!callbacks) return;
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this._notifyCallbacks.delete(channel);
        if (this._listenClient) {
          try {
            await this._listenClient.query(`UNLISTEN ${quoteIdent(channel)}`);
          } catch (e) {
            // Ignore if client is gone
          }
        }
      }
    });
  }

  /**
   * UNLISTEN a channel and drop all of its registered callbacks. Serialized
   * through the SubscriptionRegistry, the same queue used by setup/remove.
   * @param {string} channel
   */
  async unregisterChannel(channel) {
    await this._subscriptions.run(channel, () => this._unregisterChannelBody(channel));
  }

  /**
   * UNLISTEN body without going through the SubscriptionRegistry. Use this
   * only from a caller that has already taken a lock equivalent to (or
   * stronger than) the registry's per-channel queue — e.g. from inside a
   * SubscriptionRegistry `dropAtomically` slot at the provider layer.
   * Calling this from arbitrary code can interleave with setupListenNotify
   * and corrupt callback state.
   *
   * Public so adapters can compose teardown (DROP TABLE + UNLISTEN +
   * registry cleanup) without reaching into private fields.
   * @param {string} channel
   */
  async unregisterChannelDirect(channel) {
    await this._unregisterChannelBody(channel);
  }

  /**
   * Internal helper used by both the queued and direct unregister paths.
   * @param {string} channel
   * @private
   */
  async _unregisterChannelBody(channel) {
    this._notifyCallbacks.delete(channel);
    if (this._listenClient) {
      try {
        await this._listenClient.query(`UNLISTEN ${quoteIdent(channel)}`);
      } catch (e) {
        // Ignore if client is gone
      }
    }
  }

  /**
   * Forget that a table has been provisioned so the next call for it will
   * re-run ensureTable.
   * @param {string} tableName
   */
  forgetKnownTable(tableName) {
    this._knownTables.delete(tableName);
  }

  /**
   * Check if connected.
   * @returns {boolean}
   */
  isConnected() {
    return this._connected;
  }
}
