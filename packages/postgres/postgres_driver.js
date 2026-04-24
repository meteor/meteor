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
    this.setMaxListeners(0);
    this._url = url;
    this._options = options;
    this._pool = null;
    this._listenClient = null;
    this._knownTables = new Set();
    this._notifyCallbacks = new Map(); // collectionName -> Set of callbacks
    this._connected = false;

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
    return this._pool.query(text, params);
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

    const fnSql = `
      CREATE OR REPLACE FUNCTION ${quoteIdent(triggerFnName)}()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM pg_notify(${quotedChannel}, json_build_object('op', TG_OP, 'id', OLD._id)::text);
          RETURN OLD;
        ELSE
          PERFORM pg_notify(${quotedChannel}, json_build_object('op', TG_OP, 'id', NEW._id)::text);
          RETURN NEW;
        END IF;
      END;
      $$ LANGUAGE plpgsql;
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

    // Register callback
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
    if (this._listenClient) return; // Already reconnected

    let delay = 1000;
    const maxDelay = 30000;

    this.emit('listen:reconnecting');

    const attempt = async () => {
      if (!this._connected) return;
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
      } catch (e) {
        Log.warn('Postgres: LISTEN reconnect failed, retrying in ' + delay + 'ms');
        const nextDelay = delay;
        delay = Math.min(delay * 2, maxDelay);
        setTimeout(() => attempt(), nextDelay);
      }
    };

    await attempt();
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
    const callbacks = this._notifyCallbacks.get(channel);
    if (callbacks) {
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
    }
  }

  /**
   * Check if connected.
   * @returns {boolean}
   */
  isConnected() {
    return this._connected;
  }
}
