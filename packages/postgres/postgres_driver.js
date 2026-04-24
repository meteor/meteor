/**
 * PostgresConnection — wraps pg.Pool for connection management,
 * table creation, and LISTEN/NOTIFY infrastructure.
 */

import { quoteIdent, quoteLiteral } from './schema';
import { EventEmitter } from 'events';

/**
 * PostgreSQL's NAMEDATALEN is 64, so identifiers/channels are silently
 * truncated at 63 bytes. We build channel names as `meteor_pg_${collectionName}`
 * (10-byte prefix) and trigger names as `meteor_pg_${collectionName}_notify_trigger`
 * (25-byte overhead). Capping the collection name at 53 bytes ensures the longest
 * derived identifier (channel + `_notify_trigger`) stays under the 63-byte limit
 * so two similar collection names can't collide after truncation.
 */
export const MAX_COLLECTION_NAME_BYTES = 53;

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
      parseInt(process.env.METEOR_POSTGRES_MAX_LISTENERS, 10) || 1024
    );
    this.setMaxListeners(maxListeners);
    this._url = url;
    this._options = options;
    this._pool = null;
    this._listenClient = null;
    this._knownTables = new Set();
    this._notifyCallbacks = new Map(); // channel -> Set of callbacks
    this._connected = false;

    // Serialize LISTEN/UNLISTEN per channel (keyed by channel name, same as
    // _notifyCallbacks). Prevents interleaving between setupListenNotify and
    // removeListenNotify when concurrent observers race on the same channel.
    this._channelOps = new Map(); // channel -> Promise chain of ops

    // Shutdown flag + pending abort hook so _reconnectListenClient can exit
    // its backoff loop cleanly when close() is called mid-retry.
    this._shutdown = false;
    this._abortReconnectSleep = null;

    // Lazy-load pg to avoid issues during package load
    this._pg = null;
  }

  /**
   * Serialize operations that mutate LISTEN state for a single channel.
   * Both LISTEN (setupListenNotify) and UNLISTEN (removeListenNotify) paths
   * run through this queue so the `_notifyCallbacks.has(channel)` check and
   * the SQL that follows it can't interleave across coroutines.
   *
   * @param {string} channel
   * @param {() => Promise<any>} op
   * @returns {Promise<any>}
   * @private
   */
  _enqueueChannelOp(channel, op) {
    const prev = this._channelOps.get(channel) ?? Promise.resolve();
    // Run `op` whether the previous op resolved or rejected — a failure in a
    // prior setup/teardown on this channel must not block later operations.
    const next = prev.then(op, op);
    this._channelOps.set(
      channel,
      next.finally(() => {
        // Only clear the slot if nothing newer has been chained on top,
        // otherwise we'd orphan the tail of the chain.
        if (this._channelOps.get(channel) === next) {
          this._channelOps.delete(channel);
        }
      })
    );
    return next;
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
      max: this._options.poolSize || 10,
      idleTimeoutMillis: this._options.idleTimeout || 30000,
      connectionTimeoutMillis: this._options.connectionTimeout || 5000,
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
    if (typeof this._abortReconnectSleep === 'function') {
      try { this._abortReconnectSleep(); } catch (e) { /* ignore */ }
      this._abortReconnectSleep = null;
    }

    if (this._listenClient) {
      try {
        this._listenClient.release();
      } catch (e) {
        // Ignore release errors on close
      }
      this._listenClient = null;
    }

    if (this._pool) {
      await this._pool.end();
      this._pool = null;
    }

    this._connected = false;
    this._knownTables.clear();
    this._notifyCallbacks.clear();
    this._channelOps.clear();
    this.emit('disconnected');
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

    await this.query(ddl);
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

    // Serialize with any in-flight LISTEN/UNLISTEN for this same channel.
    // The `shouldListen` check, callback-set mutation, trigger DDL, and
    // LISTEN SQL must all run atomically with respect to other channel ops
    // — otherwise a concurrent removeListenNotify can delete the callback
    // set between our check and our LISTEN, or vice versa.
    await this._enqueueChannelOp(channel, async () => {
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

    this._listenClient = await this._pool.connect();
    this._attachListenClientHandlers(this._listenClient);
  }

  /**
   * Reconnect the LISTEN client with exponential backoff.
   * Re-subscribes to all active LISTEN channels.
   * @private
   */
  async _reconnectListenClient() {
    if (!this._connected) return; // Pool is closed, give up
    if (this._shutdown) return;
    if (this._listenClient) return; // Already reconnected

    let delay = 1000;
    const maxDelay = 30000;
    const maxAttempts = Math.max(
      1,
      parseInt(process.env.METEOR_POSTGRES_MAX_RECONNECT_ATTEMPTS, 10) || 10
    );

    this.emit('listen:reconnecting');

    // Cancellable sleep: resolves normally on timeout, or early when
    // close() invokes the abort hook. We expose the aborter on `this`
    // so close() can break us out of the wait synchronously.
    const cancellableSleep = (ms) => new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._abortReconnectSleep = null;
        resolve();
      }, ms);
      this._abortReconnectSleep = () => {
        clearTimeout(timer);
        this._abortReconnectSleep = null;
        resolve();
      };
    });

    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!this._connected || this._shutdown) return;
      if (this._listenClient) return;

      try {
        this._listenClient = await this._pool.connect();
        this._attachListenClientHandlers(this._listenClient);

        // Re-LISTEN all channels and collect them so observers can re-poll.
        const replayedChannels = [];
        for (const channel of this._notifyCallbacks.keys()) {
          await this._listenClient.query(`LISTEN ${quoteIdent(channel)}`);
          replayedChannels.push(channel);
        }

        // Carry the replayed channel set on the event so observe drivers
        // can trigger a fresh poll for each affected collection — writes
        // during the disconnect gap would otherwise never surface until
        // the next regular poll tick.
        this.emit('listen:reconnected', { channels: replayedChannels });
        return;
      } catch (e) {
        lastError = e;
        // Jitter: 0.5x–1.5x of the current base delay. Prevents thundering
        // herd when many connections fail at the same moment.
        const jittered = Math.floor(delay * (0.5 + Math.random()));
        Log.warn('Postgres: LISTEN reconnect failed (attempt ' + attempt +
          '/' + maxAttempts + '), retrying in ' + jittered + 'ms');
        this.emit('listen:reconnect-attempt', { attempt, delayMs: jittered });

        if (attempt === maxAttempts) break;

        await cancellableSleep(jittered);
        if (!this._connected || this._shutdown) return;

        delay = Math.min(delay * 2, maxDelay);
      }
    }

    // Exhausted retries — tear down listener state and surface the failure
    // so observers can decide whether to fall back to polling-only mode.
    this._notifyCallbacks.clear();
    if (this._listenClient) {
      try { this._listenClient.release(); } catch (e) { /* ignore */ }
      this._listenClient = null;
    }
    this.emit('listen:gave-up', { attempts: maxAttempts, error: lastError });
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
    // Serialize with any in-flight LISTEN/UNLISTEN for this channel so the
    // callback-set mutation, the emptiness check, and the UNLISTEN SQL are
    // atomic relative to a concurrent setupListenNotify on the same channel.
    await this._enqueueChannelOp(channel, async () => {
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
   * Check if connected.
   * @returns {boolean}
   */
  isConnected() {
    return this._connected;
  }
}
