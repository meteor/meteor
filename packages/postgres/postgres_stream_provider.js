/**
 * PostgresStreamProvider — AFS StreamProvider implementation for PostgreSQL.
 *
 * Provides full CRUD, reactive queries, and index management using
 * schema-aware SQL compilation.
 */

import { StreamProvider, AFSCursor, applyModifier, parseSelector, parseModifier, parseSort, parseProjection } from 'meteor/afs';
import { PostgresConnection } from './postgres_driver';
import { ResolvedSchema } from './schema';
import { documentToRow, rowToDocument } from './row_converter';
import {
  compileSet,
  buildSelectQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildUpsertQuery,
  extractEqualityFieldsFromAST,
} from './sql_compiler';
import { quoteIdent } from './schema';
import crypto from 'crypto';
import { createObserveDriver } from './observe_driver';

// Postgres NAMEDATALEN = 64 bytes; any identifier longer than 63 bytes is
// silently truncated. For index names that causes CREATE/DROP drift (you
// can't drop what you named if the stored name was truncated). Reject
// over-long names explicitly — the caller picks a shorter options.name,
// a shorter collection, or shorter field names.
const MAX_IDENTIFIER_BYTES = 63;
function assertIndexNameFits(indexName) {
  const byteLength = Buffer.byteLength(indexName, 'utf8');
  if (byteLength > MAX_IDENTIFIER_BYTES) {
    throw new Error(
      `Postgres: index name "${indexName}" is ${byteLength} bytes; must be ` +
      `<= ${MAX_IDENTIFIER_BYTES} bytes (NAMEDATALEN - 1) to avoid silent ` +
      `identifier truncation, which would prevent dropIndexAsync from ` +
      `matching the stored name. Pass a shorter options.name or use shorter ` +
      `field/collection names.`
    );
  }
}

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
    // Idempotent: if super.close() already flipped _state, nothing more to do.
    if (this._state === 'closed') return;

    this._closeMultiplexers();

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

    // Transition _state to 'closed' so post-close calls surface
    // ProviderClosedError via _assertOpen() (see C1 fix).
    await super.close();
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
    this._assertOpen('registerSchema');
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
    this._assertOpen('insertAsync');
    const schema = this._getSchema(collectionName);

    // Ensure table exists
    await this._connection.ensureTable(collectionName, schema);

    const insertDoc = doc._id ? doc : { ...doc, _id: this.generateId() };

    const { text, values } = buildInsertQuery(collectionName, insertDoc, schema);
    const result = await this._connection._queryInternal(text, values);
    return result.rows[0]._id;
  }

  async updateAsync(collectionName, selector, modifier, options = {}) {
    this._assertOpen('updateAsync');
    const schema = this._getSchema(collectionName);

    // Self-heal: first-use against a collection constructed after connect
    // would otherwise fail with `relation "x" does not exist`. ensureTable
    // is a no-op once the table has been verified.
    await this._connection.ensureTable(collectionName, schema);

    if (options.upsert) {
      return this._upsertAsync(collectionName, selector, modifier, options, schema);
    }

    const sortAST = options.sort ? parseSort(options.sort) : null;
    const optsForBuild = sortAST ? { ...options, sortAST } : options;
    const { text, values, needsFetchModifyWrite } = buildUpdateQuery(
      collectionName, parseSelector(selector), parseModifier(modifier), optsForBuild, schema
    );

    if (needsFetchModifyWrite) {
      return this._fetchModifyWrite(collectionName, selector, modifier, options, schema);
    }

    if (!text) return 0;

    const result = await this._connection._queryInternal(text, values);
    return result.rowCount;
  }

  async removeAsync(collectionName, selector) {
    this._assertOpen('removeAsync');
    const schema = this._getSchema(collectionName);
    await this._connection.ensureTable(collectionName, schema);
    const { text, values } = buildDeleteQuery(collectionName, parseSelector(selector), schema);
    const result = await this._connection._queryInternal(text, values);
    return result.rowCount;
  }

  async findOneAsync(collectionName, selector, options = {}) {
    this._assertOpen('findOneAsync');
    const results = await this.fetchResults(collectionName, selector, { ...options, limit: 1 });
    return results[0];
  }

  async upsertAsync(collectionName, selector, modifier, options = {}) {
    this._assertOpen('upsertAsync');
    const schema = this._getSchema(collectionName);
    await this._connection.ensureTable(collectionName, schema);
    return this._upsertAsync(collectionName, selector, modifier, options, schema);
  }

  // ---------------------------------------------------------------------------
  // Query / Cursor
  // ---------------------------------------------------------------------------

  find(collectionName, selector = {}, options = {}) {
    this._assertOpen('find');
    return new AFSCursor(this, collectionName, selector, options);
  }

  /**
   * Fetch query results. Called by AFSCursor.fetchAsync().
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} options
   * @returns {Promise<Object[]>}
   */
  async fetchResults(collectionName, selector, options = {}) {
    this._assertOpen('fetchResults');
    const schema = this._getSchema(collectionName);
    await this._connection.ensureTable(collectionName, schema);
    const { text, values } = buildSelectQuery(
      collectionName,
      parseSelector(selector),
      options.sort ? parseSort(options.sort) : null,
      (options.fields || options.projection) ? parseProjection(options.fields || options.projection) : null,
      options,
      schema
    );
    const result = await this._connection._queryInternal(text, values);
    return result.rows.map(row => rowToDocument(row, schema));
  }

  // ---------------------------------------------------------------------------
  // Reactive observers
  // ---------------------------------------------------------------------------

  async observeChanges(cursorDescription, ordered, callbacks, options = {}) {
    this._assertOpen('observeChanges');
    // Delegate to the EventEmitter path via the cached multiplexer
    const multiplexer = await this._getMultiplexer(cursorDescription, ordered);
    return multiplexer.addHandle(callbacks, options);
  }

  // ---------------------------------------------------------------------------
  // EventEmitter-based reactive support
  // ---------------------------------------------------------------------------

  supportsEventEmitter() {
    return true;
  }

  startObserving(cursorDescription, ordered) {
    return createObserveDriver(cursorDescription, ordered, this);
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  async createIndexAsync(collectionName, index, options = {}) {
    this._assertOpen('createIndexAsync');
    const schema = this._getSchema(collectionName);
    const indexName = options.name || `idx_${collectionName}_${Object.keys(index).join('_')}`;

    // Postgres NAMEDATALEN = 64 → identifiers silently truncate past 63
    // bytes. A name that "worked" at CREATE time then fails to match
    // the same name at DROP time, so refuse to proceed. Mirrors the
    // collection-name guard in postgres_driver.js.
    assertIndexNameFits(indexName);

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
    await this._connection._queryInternal(sql);
  }

  async dropIndexAsync(collectionName, indexName) {
    this._assertOpen('dropIndexAsync');
    // Same truncation trap — refuse a name we would be unable to match
    // against the stored identifier if it had been truncated at create.
    assertIndexNameFits(indexName);
    await this._connection._queryInternal(`DROP INDEX IF EXISTS ${quoteIdent(indexName)}`);
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

  generateId() {
    return Random.id();
  }

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------

  capabilities() {
    return {
      ...super.capabilities(),
      // `transactions: true` means this provider exposes an explicit
      // withTransactionAsync() entry point for callers to run multiple
      // statements atomically. CRUD operations that need internal
      // transactional guarantees (fetch-modify-write updates, non-_id
      // upsert serialization) already use transactions under the hood.
      transactions: true,
      joins: true,
      selectorOperators: [
        'And', 'Or', 'Nor', 'Not', 'Field',
      ],
      selectorPredicates: [
        'Eq', 'Ne', 'Gt', 'Gte', 'Lt', 'Lte', 'In', 'Nin',
        'Exists', 'Type', 'Regex', 'Mod', 'Size', 'All', 'ElemMatch',
      ],
      modifierOperators: [
        'Set', 'SetOnInsert', 'Unset', 'Inc', 'Mul', 'Min', 'Max', 'Rename',
        'CurrentDate', 'Push', 'Pop', 'Pull', 'PullAll', 'AddToSet', 'Bit',
      ],
      upsert: true,
    };
  }

  /**
   * Run `callback` inside a single Postgres transaction. The callback
   * receives a transactional query function `(sql, params) => Promise<result>`
   * — use it for every statement that must be part of the transaction.
   * The transaction commits on normal return and rolls back on any throw.
   *
   * This is the public surface behind `capabilities().transactions`.
   * Callers that need lower-level client access (e.g. LISTEN, cursors)
   * can `rawDatabase().connect()` and manage BEGIN/COMMIT themselves.
   *
   * @param {(query: (sql: string, params?: any[]) => Promise<any>) => Promise<any>} callback
   * @returns {Promise<any>} the callback's return value
   */
  async withTransactionAsync(callback) {
    this._assertOpen('withTransactionAsync');
    const client = await this._connection.getClient();
    try {
      await client.query('BEGIN');
      const txQuery = (sql, params) => client.query(sql, params);
      const result = await callback(txQuery);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Drop collection
  // ---------------------------------------------------------------------------

  async dropCollectionAsync(collectionName) {
    this._assertOpen('dropCollectionAsync');
    // Full teardown: table, trigger function, LISTEN state, cached schema.
    // Trigger function name follows the convention used by
    // postgres_driver.js setupListenNotify: `meteor_pg_<name>_notify_fn`.
    //
    // All three steps — DROP TABLE, DROP FUNCTION, UNLISTEN — run inside the
    // same channel-op slot so they cannot interleave with a pending
    // setupListenNotify for the same collection. Without this, a LISTEN
    // completing between our DROP TABLE and UNLISTEN would leave the
    // LISTEN client subscribed to a channel whose trigger we're about to
    // delete.
    const channel = `meteor_pg_${collectionName}`;
    const triggerFnName = `${channel}_notify_fn`;

    await this._connection.runChannelOp(channel, async () => {
      await this._connection._queryInternal(
        `DROP TABLE IF EXISTS ${quoteIdent(collectionName)} CASCADE`
      );
      await this._connection._queryInternal(
        `DROP FUNCTION IF EXISTS ${quoteIdent(triggerFnName)}() CASCADE`
      );

      // Inlined unregisterChannel body — we're already inside the queue
      // slot for this channel, so calling unregisterChannel would deadlock.
      this._connection._notifyCallbacks.delete(channel);
      if (this._connection._listenClient) {
        try {
          await this._connection._listenClient.query(
            `UNLISTEN ${quoteIdent(channel)}`
          );
        } catch (e) {
          // Ignore if client is gone.
        }
      }
    });

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
        collectionName, parseSelector(selector), null, null, {}, schema
      );
      const lockSql = selectText + ' FOR UPDATE' + (options.multi ? '' : ' LIMIT 1');
      const selectResult = await client.query(lockSql, selectValues);

      for (const row of selectResult.rows) {
        const doc = rowToDocument(row, schema);

        applyModifier(doc, modifier);

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
   *
   * Three paths:
   * 1. Modifier uses operators the single-statement compiler cannot emit as
   *    SET clauses ($pull, $rename, $addToSet, $push with $each, etc.): route
   *    through _fetchModifyWriteUpsert so the modifier is honored on both
   *    the insert and update branches.
   * 2. Non-`_id` selector with a simple modifier: let buildUpsertQuery emit
   *    its CTE form, but wrap the query in a transaction that takes an
   *    advisory lock keyed on (collectionName, selector) so two concurrent
   *    upserts with the same selector serialize and can't both INSERT.
   * 3. `_id` selector with simple modifier: ON CONFLICT(_id) path — atomic
   *    by primary key, no locking needed.
   */
  async _upsertAsync(collectionName, selector, modifier, options, schema) {
    const modifierAST = parseModifier(modifier);
    const { needsFetchModifyWrite } = compileSet(modifierAST, schema);

    if (needsFetchModifyWrite) {
      return this._fetchModifyWriteUpsert(
        collectionName, selector, modifier, options, schema
      );
    }

    const selectorAST = parseSelector(selector);
    // Match buildUpsertQuery's view of "the selector pins _id" — extract
    // _id from the AST (handles $and, dotted paths, etc.) so the dispatch
    // here and the SQL emitted there agree on whether ON CONFLICT(_id) is
    // safe vs whether we need the advisory-lock path.
    const hasIdSelector = extractEqualityFieldsFromAST(selectorAST)
      .some((f) => f.path === '_id');

    if (!hasIdSelector) {
      // Non-`_id` selector path: wrap in a transaction with an advisory lock
      // keyed on the selector so concurrent upserts serialize (I4).
      return this._upsertNonIdWithLock(
        collectionName, selector, selectorAST, modifierAST, options, schema
      );
    }

    const { text, values } = buildUpsertQuery(
      collectionName, selectorAST, modifierAST, schema
    );

    const result = await this._connection._queryInternal(text, values);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return { numberAffected: 1, insertedId: row.__inserted ? row._id : undefined };
    }

    // ON CONFLICT DO NOTHING returned no rows — means conflict with existing _id, need to update
    // Fall back to regular update
    const updateCount = await this.updateAsync(collectionName, selector, modifier, { ...options, upsert: false });
    return { numberAffected: updateCount };
  }

  /**
   * Non-`_id` upsert under an advisory lock. The lock key is derived from
   * (collectionName, canonical selector JSON) so two concurrent upserts with
   * the same selector serialize — without it, both transactions can observe
   * no matching row and both INSERT, producing duplicates.
   */
  async _upsertNonIdWithLock(collectionName, selector, selectorAST, modifierAST, options, schema) {
    const lockKey = this._advisoryLockKey(collectionName, selector);

    const client = await this._connection.getClient();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

      const { text, values } = buildUpsertQuery(
        collectionName, selectorAST, modifierAST, schema
      );
      const result = await client.query(text, values);

      let response;
      if (result.rows.length > 0) {
        const row = result.rows[0];
        response = { numberAffected: 1, insertedId: row.__inserted ? row._id : undefined };
      } else {
        // Shouldn't happen with the CTE form (it always returns one row);
        // kept as a safety net for the _id-bearing ON CONFLICT variant.
        response = { numberAffected: 0 };
      }

      await client.query('COMMIT');
      return response;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Fetch-modify-write upsert: lock-matching-row → applyModifier →
   * write back. If no row matches, synthesize a new doc from selector +
   * $setOnInsert and apply the modifier to an empty document.
   */
  async _fetchModifyWriteUpsert(collectionName, selector, modifier, options, schema) {
    await this._connection.ensureTable(collectionName, schema);

    const lockKey = this._advisoryLockKey(collectionName, selector);
    const client = await this._connection.getClient();

    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

      // SELECT … FOR UPDATE the first matching row.
      const { text: selectText, values: selectValues } = buildSelectQuery(
        collectionName, parseSelector(selector), null, null, {}, schema
      );
      const selectResult = await client.query(
        selectText + ' FOR UPDATE LIMIT 1', selectValues
      );

      if (selectResult.rows.length > 0) {
        // Update path — apply modifier to the fetched doc.
        const doc = rowToDocument(selectResult.rows[0], schema);
        applyModifier(doc, modifier);
        const newRow = documentToRow(doc, schema);

        const setClauses = [];
        const updateValues = [];
        let idx = 0;
        if (schema) {
          for (const colName of schema.getColumnNames()) {
            idx++;
            setClauses.push(`${quoteIdent(colName)} = $${idx}`);
            updateValues.push(newRow[colName] !== undefined ? newRow[colName] : null);
          }
        }
        idx++;
        setClauses.push(`_extra = $${idx}`);
        updateValues.push(newRow._extra || {});
        idx++;
        updateValues.push(doc._id);

        const updateSql =
          `UPDATE ${quoteIdent(collectionName)} SET ${setClauses.join(', ')} ` +
          `WHERE _id = $${idx}`;
        await client.query(updateSql, updateValues);

        await client.query('COMMIT');
        return { numberAffected: 1, insertedId: undefined };
      }

      // Insert path — build the new doc from selector + $setOnInsert, then
      // apply the modifier on top. `_modify` with `isInsert: true` throws on
      // operators that are not legal at insert time.
      const insertDoc = this._buildUpsertInsertDoc(selector, modifier);
      applyModifier(insertDoc, modifier, { isInsert: true });

      const { text: insertSql, values: insertValues } = buildInsertQuery(
        collectionName, insertDoc, schema
      );
      const insertRes = await client.query(insertSql, insertValues);

      await client.query('COMMIT');
      return { numberAffected: 1, insertedId: insertRes.rows[0]._id };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Seed an insert doc from the upsert selector's scalar fields plus
   * $setOnInsert. Anything else ($set, array ops, etc.) is left to
   * applyModifier.
   */
  _buildUpsertInsertDoc(selector, modifier) {
    const doc = {};
    if (selector && typeof selector === 'object') {
      for (const [k, v] of Object.entries(selector)) {
        if (k.startsWith('$')) continue;
        if (v === null || v === undefined) continue;
        if (typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
          // Operator object ({$gt: 5}) — skip.
          const subKeys = Object.keys(v);
          if (subKeys.length > 0 && subKeys.every(sk => sk.startsWith('$'))) continue;
        }
        doc[k] = v;
      }
    }
    if (!doc._id) doc._id = this.generateId();
    return doc;
  }

  /**
   * Derive a stable 64-bit advisory lock key from (collectionName, selector).
   * SHA-1 is cheap and collision risk across two different selectors is
   * astronomical at the serialization rates this path sees.
   */
  _advisoryLockKey(collectionName, selector) {
    const material = `${collectionName}\0${EJSON.stringify(selector)}`;
    const h = crypto.createHash('sha1').update(material).digest();
    // Take the low 64 bits and return as a signed BigInt — pg accepts BigInt
    // for bigint parameters and wraps into signed range on its own.
    const low64 = h.readBigInt64BE(0);
    return low64;
  }
}
