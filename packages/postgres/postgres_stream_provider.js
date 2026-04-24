/**
 * PostgresStreamProvider — AFS StreamProvider implementation for PostgreSQL.
 *
 * Provides full CRUD, reactive queries, and index management using
 * schema-aware SQL compilation.
 */

import { StreamProvider } from 'meteor/afs';
import { AFSCursor } from 'meteor/afs';
import { PostgresConnection } from './postgres_driver';
import { ResolvedSchema } from './schema';
import { documentToRow, rowToDocument } from './row_converter';
import {
  compileSelector,
  compileModifier,
  buildSelectQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildUpsertQuery,
} from './sql_compiler';
import { quoteIdent } from './schema';
import { getObserveDriver, dropCachedDriversForProvider } from './observe_driver';

export class PostgresStreamProvider extends StreamProvider {
  /**
   * @param {string} url - PostgreSQL connection URL
   * @param {Object} [options]
   */
  constructor(url, options = {}) {
    super({ name: 'postgres' });
    this._url = url;
    this._options = options;
    this._connection = null;
    this._schemas = new Map(); // collectionName → ResolvedSchema
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  async connect() {
    this._connection = new PostgresConnection(this._url, this._options);
    await this._connection.connect();
    this._connected = true;
  }

  async close() {
    this._closeMultiplexers();

    // Drop any observe drivers cached for this provider so they don't
    // hold references to the about-to-be-closed connection.
    try {
      dropCachedDriversForProvider(this);
    } catch (e) {
      // Best effort — the export may not exist yet in partial-merge states.
    }

    if (this._connection) {
      // Proactively release the LISTEN client's channels so a pooled
      // connection returning to a pool can't leak notifications across
      // reconnects. Wrapped in try/catch because the client may already
      // be gone if the connection errored.
      const listenClient = this._connection._listenClient;
      if (listenClient) {
        try {
          await listenClient.query('UNLISTEN *');
        } catch (e) {
          // Ignore — client may already be disconnected.
        }
      }

      await this._connection.close();
      this._connection = null;
    }
    this._connected = false;
  }

  // ---------------------------------------------------------------------------
  // Schema management
  // ---------------------------------------------------------------------------

  /**
   * Register a schema for a collection and ensure the table exists.
   * @param {string} collectionName
   * @param {ResolvedSchema} schema
   */
  async registerSchema(collectionName, schema) {
    this._schemas.set(collectionName, schema);
    if (this._connection && this._connection.isConnected()) {
      await this._connection.ensureTable(collectionName, schema);
    }
  }

  /**
   * Get the schema for a collection.
   * @param {string} collectionName
   * @returns {ResolvedSchema|null}
   */
  _getSchema(collectionName) {
    return this._schemas.get(collectionName) || null;
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  async insertAsync(collectionName, doc) {
    const schema = this._getSchema(collectionName);

    // Ensure table exists
    await this._connection.ensureTable(collectionName, schema);

    const insertDoc = doc._id ? doc : { ...doc, _id: this.generateId(collectionName) };

    const { text, values } = buildInsertQuery(collectionName, insertDoc, schema);
    const result = await this._connection.query(text, values);
    return result.rows[0]._id;
  }

  async updateAsync(collectionName, selector, modifier, options = {}) {
    const schema = this._getSchema(collectionName);

    if (options.upsert) {
      return this._upsertAsync(collectionName, selector, modifier, options, schema);
    }

    const { text, values, needsFetchModifyWrite } = buildUpdateQuery(
      collectionName, selector, modifier, options, schema
    );

    if (needsFetchModifyWrite) {
      return this._fetchModifyWrite(collectionName, selector, modifier, options, schema);
    }

    if (!text) return 0;

    const result = await this._connection.query(text, values);
    return result.rowCount;
  }

  async removeAsync(collectionName, selector) {
    const schema = this._getSchema(collectionName);
    const { text, values } = buildDeleteQuery(collectionName, selector, schema);
    const result = await this._connection.query(text, values);
    return result.rowCount;
  }

  async findOneAsync(collectionName, selector, options = {}) {
    const results = await this._fetchResults(collectionName, selector, { ...options, limit: 1 });
    return results[0];
  }

  async upsertAsync(collectionName, selector, modifier, options = {}) {
    return this._upsertAsync(collectionName, selector, modifier, options, this._getSchema(collectionName));
  }

  // ---------------------------------------------------------------------------
  // Query / Cursor
  // ---------------------------------------------------------------------------

  find(collectionName, selector = {}, options = {}) {
    return new AFSCursor(this, collectionName, selector, options);
  }

  /**
   * Fetch query results. Called by AFSCursor.fetchAsync().
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} options
   * @returns {Promise<Object[]>}
   */
  async _fetchResults(collectionName, selector, options = {}) {
    const schema = this._getSchema(collectionName);
    const { text, values } = buildSelectQuery(collectionName, selector, options, schema);
    const result = await this._connection.query(text, values);
    return result.rows.map(row => rowToDocument(row, schema));
  }

  // ---------------------------------------------------------------------------
  // Reactive observers
  // ---------------------------------------------------------------------------

  async observeChanges(cursorDescription, ordered, callbacks, options = {}) {
    // Delegate to the EventEmitter path via the cached multiplexer
    const multiplexer = await this._getMultiplexer(cursorDescription, ordered);
    return multiplexer.addHandle(callbacks, options);
  }

  // ---------------------------------------------------------------------------
  // EventEmitter-based reactive support
  // ---------------------------------------------------------------------------

  _supportsEventEmitter() {
    return true;
  }

  startObserving(cursorDescription, ordered) {
    return getObserveDriver(cursorDescription, ordered, this);
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  async createIndexAsync(collectionName, index, options = {}) {
    const schema = this._getSchema(collectionName);
    const indexName = options.name || `idx_${collectionName}_${Object.keys(index).join('_')}`;
    const unique = options.unique ? 'UNIQUE ' : '';

    const columns = Object.entries(index).map(([field, dir]) => {
      const resolved = schema ? schema.resolveField(field) : { sqlRef: quoteIdent(field), kind: 'column' };

      if (resolved.kind === 'jsonb_path' || resolved.kind === 'extra' || resolved.kind === 'extra_path') {
        // JSONB expression index
        return `(${resolved.sqlRef})`;
      }

      const direction = dir === -1 ? 'DESC' : 'ASC';
      return `${resolved.sqlRef} ${direction}`;
    });

    const sql = `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdent(indexName)} ON ${quoteIdent(collectionName)} (${columns.join(', ')})`;
    await this._connection.query(sql);
  }

  async dropIndexAsync(collectionName, indexName) {
    await this._connection.query(`DROP INDEX IF EXISTS ${quoteIdent(indexName)}`);
  }

  // ---------------------------------------------------------------------------
  // Raw access
  // ---------------------------------------------------------------------------

  rawDatabase() {
    return this._connection ? this._connection.getPool() : null;
  }

  rawCollection(collectionName) {
    return collectionName; // Table name string
  }

  // ---------------------------------------------------------------------------
  // ID generation
  // ---------------------------------------------------------------------------

  generateId(collectionName) {
    return Random.id();
  }

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------

  capabilities() {
    return {
      reactiveQueries: true,
      transactions: true,
      changeStreams: false,
      oplog: false,
      fullTextSearch: false,
      geoQueries: false,
      aggregation: false,
      joins: true,
      upsert: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Schema support
  // ---------------------------------------------------------------------------

  supportsSchema() {
    return true;
  }

  async migrateSchema(collectionName, schema) {
    const resolved = new ResolvedSchema(schema);
    await this.registerSchema(collectionName, resolved);
  }

  // ---------------------------------------------------------------------------
  // Drop collection
  // ---------------------------------------------------------------------------

  async dropCollectionAsync(collectionName) {
    // Full teardown: table, trigger function, LISTEN state, cached schema.
    // Trigger function name follows the convention used by
    // postgres_driver.js setupListenNotify: `meteor_pg_<name>_notify_fn`.
    const channel = `meteor_pg_${collectionName}`;
    const triggerFnName = `${channel}_notify_fn`;

    await this._connection.query(
      `DROP TABLE IF EXISTS ${quoteIdent(collectionName)} CASCADE`
    );
    await this._connection.query(
      `DROP FUNCTION IF EXISTS ${quoteIdent(triggerFnName)}() CASCADE`
    );

    await this._connection.unregisterChannel(channel);
    this._connection.forgetKnownTable(collectionName);
    this._schemas.delete(collectionName);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch-modify-write pattern for complex modifiers.
   * Uses a transaction with SELECT FOR UPDATE → JS modify → UPDATE.
   *
   * Each attempt sets per-transaction statement/idle timeouts (env-tunable
   * via METEOR_POSTGRES_STATEMENT_TIMEOUT_MS and
   * METEOR_POSTGRES_IDLE_IN_TX_TIMEOUT_MS) and, for multi-doc updates,
   * REPEATABLE READ isolation. Serialization failures (SQLSTATE 40001) are
   * retried up to 3 times before bubbling.
   */
  async _fetchModifyWrite(collectionName, selector, modifier, options, schema) {
    const MAX_ATTEMPTS = 3;
    let lastErr = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this._fetchModifyWriteOnce(
          collectionName, selector, modifier, options, schema
        );
      } catch (e) {
        // PG serialization failure — safe to retry on a fresh transaction.
        if (e && e.code === '40001' && attempt < MAX_ATTEMPTS) {
          lastErr = e;
          continue;
        }
        throw e;
      }
    }

    // Should be unreachable (the loop either returns or throws), but keep a
    // guard in case MAX_ATTEMPTS is ever set to 0.
    throw lastErr || new Error('Postgres _fetchModifyWrite: exhausted retries');
  }

  async _fetchModifyWriteOnce(collectionName, selector, modifier, options, schema) {
    const statementTimeoutMs = Math.max(
      1000,
      parseInt(process.env.METEOR_POSTGRES_STATEMENT_TIMEOUT_MS, 10) || 30000
    );
    const idleInTxTimeoutMs = Math.max(
      1000,
      parseInt(process.env.METEOR_POSTGRES_IDLE_IN_TX_TIMEOUT_MS, 10) || 10000
    );

    const client = await this._connection.getClient();
    let affected = 0;

    try {
      await client.query('BEGIN');

      if (options.multi === true) {
        // REPEATABLE READ prevents phantom-insert inconsistency for multi-doc updates; full SERIALIZABLE would need retry-on-40001 logic we skip for now.
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      }

      // Per-transaction timeouts: bound worst-case lock waits and prevent a
      // stalled client from holding row locks indefinitely.
      await client.query(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
      await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${idleInTxTimeoutMs}`);

      // Fetch matching rows with FOR UPDATE lock
      const { text: selectText, values: selectValues } = buildSelectQuery(
        collectionName, selector, {}, schema
      );
      const lockSql = selectText + ' FOR UPDATE' + (options.multi ? '' : ' LIMIT 1');
      const selectResult = await client.query(lockSql, selectValues);

      for (const row of selectResult.rows) {
        const doc = rowToDocument(row, schema);

        // Apply modifier using Minimongo's _modify
        LocalCollection._modify(doc, modifier);

        // Convert back to row and update
        const newRow = documentToRow(doc, schema);
        const setClauses = [];
        const updateValues = [];
        let idx = 0;

        // Set all schema columns
        if (schema) {
          for (const colName of schema.getColumnNames()) {
            idx++;
            setClauses.push(`${quoteIdent(colName)} = $${idx}`);
            updateValues.push(newRow[colName] !== undefined ? newRow[colName] : null);
          }
        }

        // Set _extra
        idx++;
        setClauses.push(`_extra = $${idx}`);
        updateValues.push(newRow._extra || {});

        // WHERE _id = ...
        idx++;
        updateValues.push(doc._id);

        const updateSql = `UPDATE ${quoteIdent(collectionName)} SET ${setClauses.join(', ')} WHERE _id = $${idx}`;
        await client.query(updateSql, updateValues);
        affected++;
      }

      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        // Ignore — original error is more informative.
      }
      throw e;
    } finally {
      client.release();
    }

    return affected;
  }

  /**
   * Handle upsert operations.
   */
  async _upsertAsync(collectionName, selector, modifier, options, schema) {
    const { text, values } = buildUpsertQuery(
      collectionName, selector, modifier, schema
    );

    const result = await this._connection.query(text, values);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return { numberAffected: 1, insertedId: row.__inserted ? row._id : undefined };
    }

    // ON CONFLICT DO NOTHING returned no rows — means conflict with existing _id, need to update
    // Fall back to regular update
    const updateCount = await this.updateAsync(collectionName, selector, modifier, { ...options, upsert: false });
    return { numberAffected: updateCount };
  }
}
