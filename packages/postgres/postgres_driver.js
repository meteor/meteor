/**
 * PostgresConnection — wraps pg.Pool for connection management,
 * table creation, and LISTEN/NOTIFY infrastructure.
 */

import { quoteIdent, quoteLiteral } from './schema';
import { EventEmitter } from 'events';

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
      await this.query(fnSql);
      await this.query(triggerSql);
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

        // Re-LISTEN all channels
        for (const channel of this._notifyCallbacks.keys()) {
          await this._listenClient.query(`LISTEN ${quoteIdent(channel)}`);
        }

        this.emit('listen:reconnected');
      } catch (e) {
        Log.warn('Postgres: LISTEN reconnect failed, retrying in ' + delay + 'ms');
        const nextDelay = delay;
        delay = Math.min(delay * 2, maxDelay);
        setTimeout(() => attempt(), nextDelay);
      }
    };

    await attempt();
  }

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
        }
      }
    });

    client.on('error', (err) => {
      Log.error('Postgres LISTEN client error:', err);
      const oldClient = this._listenClient;
      this._listenClient = null;
      try { oldClient.end(); } catch (e) { /* ignore */ }
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
