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
import { getObserveDriver } from './observe_driver';

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
    if (this._connection) {
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

    // Generate _id if needed
    if (!doc._id) {
      doc._id = this.generateId(collectionName);
    }

    const { text, values } = buildInsertQuery(collectionName, doc, schema);
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
    const driver = getObserveDriver(cursorDescription, ordered, this);
    return driver.addObserver(callbacks);
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
    await this._connection.query(`DROP TABLE IF EXISTS ${quoteIdent(collectionName)} CASCADE`);
    this._connection._knownTables.delete(collectionName);
    this._schemas.delete(collectionName);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch-modify-write pattern for complex modifiers.
   * Uses a transaction with SELECT FOR UPDATE → JS modify → UPDATE.
   */
  async _fetchModifyWrite(collectionName, selector, modifier, options, schema) {
    const client = await this._connection.getClient();
    let affected = 0;

    try {
      await client.query('BEGIN');

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
      await client.query('ROLLBACK');
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
    const { text, values, insertedId } = buildUpsertQuery(
      collectionName, selector, modifier, schema
    );

    const result = await this._connection.query(text, values);

    if (result.rows.length > 0) {
      return { numberAffected: 1, insertedId: result.rows[0]._id === insertedId ? insertedId : undefined };
    }

    // ON CONFLICT DO NOTHING returned no rows — means conflict with existing _id, need to update
    // Fall back to regular update
    const updateCount = await this.updateAsync(collectionName, selector, modifier, { ...options, upsert: false });
    return { numberAffected: updateCount };
  }
}
