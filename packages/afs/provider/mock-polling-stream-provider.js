import { PollingStreamProvider } from './polling-stream-provider';
import { NotSupportedError } from './stream-provider';
import { AFSCursor } from '../collection/cursor';
import { match } from '../query/match';
import { parseSelector } from '../query/parse-selector';
import { parseSort } from '../query/parse-sort';
import { parseProjection } from '../query/parse-projection';
import { AST } from '../query/ast';

/**
 * MockPollingStreamProvider — in-memory provider that extends
 * PollingStreamProvider so adapter authors have a polling-shaped reference
 * impl + test target without a real database. CRUD lives on top of the
 * polling base; CRUD paths fire `requestImmediatePoll` so observers don't
 * have to wait for the next cadence tick.
 *
 * Documents are stored by `_id` in a nested map. There is no transactional
 * isolation in memory, so `_isRetryableConflict` is a no-op (false). Tests
 * that want to exercise the retry path can subclass and override.
 */
export class MockPollingStreamProvider extends PollingStreamProvider {
  constructor(options = {}) {
    super({ name: 'mock-polling', pollIntervalMs: 60_000, ...options });
    /** @type {Map<string, Map<any, Object>>} */
    this._store = new Map();
    this._connected = true;
    // Pre-parse capability list so each call doesn't re-allocate.
    this._caps = {
      reactiveQueries: true,
      transactions: false,
      changeStreams: false,
      oplog: false,
      fullTextSearch: false,
      geoQueries: false,
      aggregation: false,
      joins: false,
      upsert: true,
      // Operators the mock will accept. $where is intentionally excluded so
      // the capability-gating test can prove the gate fires.
      selectorOperators: ['And', 'Or', 'Nor', 'Not', 'Field'],
      selectorPredicates: [
        'Eq', 'Ne', 'Gt', 'Gte', 'Lt', 'Lte', 'In', 'Nin',
        'Exists', 'Type', 'Regex', 'Mod', 'Size', 'All', 'ElemMatch',
      ],
      modifierOperators: [
        'Set', 'SetOnInsert', 'Unset', 'Inc', 'Mul', 'Min', 'Max', 'Rename',
        'CurrentDate', 'Push', 'Pop', 'Pull', 'PullAll', 'AddToSet', 'Bit',
      ],
    };
  }

  capabilities() {
    return { ...this._caps };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect() {
    // In-memory: nothing to dial. Reopen if previously closed.
    this._state = 'open';
    this._connected = true;
  }

  async _closeTransport() {
    // Drop every collection map and per-cursor poller (poller cleanup is
    // already driven by the base via _closeMultiplexers → stream.stop →
    // teardown; this is just defense-in-depth for direct close calls).
    for (const ctx of Array.from(this._pollers.values())) {
      this._stopPoller(ctx);
    }
    this._store.clear();
  }

  // ---------------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------------

  /** @protected */
  _getCollection(collectionName) {
    let coll = this._store.get(collectionName);
    if (!coll) {
      coll = new Map();
      this._store.set(collectionName, coll);
    }
    return coll;
  }

  // ---------------------------------------------------------------------------
  // Capability gating
  // ---------------------------------------------------------------------------

  /**
   * Walk the parsed selector and reject any node-type or predicate kind the
   * capabilities() dict does not list. Mirrors the gate adapters typically
   * run before compiling a query — the mock implements it directly so the
   * capability surface is actually enforced (and testable).
   *
   * Recurses manually because afs's `walkSelector` is dispatch-style: it
   * calls one handler and lets the handler decide whether to descend.
   * @protected
   */
  _assertSelectorSupported(rawSelector) {
    if (!rawSelector || Object.keys(rawSelector).length === 0) return;
    const ast = parseSelector(rawSelector);
    const allowedOps = new Set(this._caps.selectorOperators);
    const allowedPreds = new Set(this._caps.selectorPredicates);

    const visit = (node) => {
      switch (node.type) {
        case AST.AND:
        case AST.OR:
        case AST.NOR: {
          const opName =
            node.type === AST.AND ? 'And' :
            node.type === AST.OR ? 'Or' : 'Nor';
          if (!allowedOps.has(opName)) {
            throw new NotSupportedError(this.name, opName);
          }
          (node.clauses || []).forEach(visit);
          return;
        }
        case AST.NOT:
          if (!allowedOps.has('Not')) {
            throw new NotSupportedError(this.name, 'Not');
          }
          visit(node.clause);
          return;
        case AST.FIELD:
          if (!allowedOps.has('Field')) {
            throw new NotSupportedError(this.name, 'Field');
          }
          if (node.predicate && node.predicate.kind &&
              !allowedPreds.has(node.predicate.kind)) {
            throw new NotSupportedError(this.name, node.predicate.kind);
          }
          return;
        case AST.WHERE:
          throw new NotSupportedError(this.name, '$where');
        case AST.EXPR:
          throw new NotSupportedError(this.name, '$expr');
        case AST.GEO:
          throw new NotSupportedError(this.name, 'geo query');
        case AST.TEXT:
          throw new NotSupportedError(this.name, '$text');
        default:
          throw new NotSupportedError(this.name, node.type);
      }
    };
    visit(ast);
  }

  // ---------------------------------------------------------------------------
  // Polling: snapshot for the cadence loop
  // ---------------------------------------------------------------------------

  /** @protected */
  async _fetchSnapshot(cursorDescription) {
    return this._fetchResults(cursorDescription);
  }

  /**
   * Snapshot path used by both _fetchSnapshot and fetchResults — selector
   * filter, sort, skip/limit, projection — all in JS over the in-memory map.
   * @protected
   */
  _fetchResults(cursorDescription) {
    const { collectionName, selector, options } = cursorDescription;
    this._assertSelectorSupported(selector);
    const coll = this._getCollection(collectionName);

    const ast = (selector && Object.keys(selector).length > 0)
      ? parseSelector(selector)
      : null;

    let docs = [];
    for (const doc of coll.values()) {
      if (!ast || match(doc, ast)) {
        docs.push(EJSON.clone(doc));
      }
    }

    if (options && options.sort) {
      const sortAst = parseSort(options.sort);
      docs = sortDocs(docs, sortAst);
    }
    const skip = options && options.skip;
    const limit = options && options.limit;
    if (skip) docs = docs.slice(skip);
    if (limit != null) docs = docs.slice(0, limit);
    if (options && (options.projection || options.fields)) {
      const projAst = parseProjection(options.projection || options.fields);
      docs = docs.map(d => projectDoc(d, projAst));
    }
    return docs;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async insertAsync(collectionName, doc) {
    this._assertOpen('insertAsync');
    const coll = this._getCollection(collectionName);
    const cloned = EJSON.clone(doc);
    if (cloned._id == null) {
      cloned._id = this.generateId(collectionName);
    }
    if (coll.has(cloned._id)) {
      const e = new Error(`duplicate _id: ${cloned._id}`);
      e.code = 'duplicate-key';
      throw e;
    }
    coll.set(cloned._id, cloned);
    this._notifyCollectionChanged(collectionName);
    return cloned._id;
  }

  async removeAsync(collectionName, selector) {
    this._assertOpen('removeAsync');
    this._assertSelectorSupported(selector);
    const coll = this._getCollection(collectionName);
    const ast = (selector && Object.keys(selector).length > 0)
      ? parseSelector(selector)
      : null;
    let removed = 0;
    for (const [id, doc] of Array.from(coll.entries())) {
      if (!ast || match(doc, ast)) {
        coll.delete(id);
        removed++;
      }
    }
    if (removed > 0) this._notifyCollectionChanged(collectionName);
    return removed;
  }

  async updateAsync(collectionName, selector, modifier, options = {}) {
    this._assertOpen('updateAsync');
    this._assertSelectorSupported(selector);
    if (options.upsert) {
      return this.upsertAsync(collectionName, selector, modifier, options);
    }
    const opts = { ...options, _collectionName: collectionName };
    const result = await this._fetchModifyWrite(collectionName, selector, modifier, opts);
    if (result.modifiedCount > 0) this._notifyCollectionChanged(collectionName);
    return result.modifiedCount;
  }

  async upsertAsync(collectionName, selector, modifier, options = {}) {
    this._assertOpen('upsertAsync');
    this._assertSelectorSupported(selector);
    const opts = { ...options, _collectionName: collectionName };
    const result = await this._fetchModifyWriteUpsert(collectionName, selector, modifier, opts);
    if (result.modifiedCount > 0 || result.insertedId !== undefined) {
      this._notifyCollectionChanged(collectionName);
    }
    return result;
  }

  async findOneAsync(collectionName, selectorOrId, options = {}) {
    this._assertOpen('findOneAsync');
    if (typeof selectorOrId === 'string') {
      const doc = this._getCollection(collectionName).get(selectorOrId);
      return doc ? EJSON.clone(doc) : undefined;
    }
    const docs = this._fetchResults({
      collectionName,
      selector: selectorOrId || {},
      options: { ...options, limit: 1 },
    });
    return docs[0];
  }

  async fetchResults(collectionName, selector, options) {
    this._assertOpen('fetchResults');
    return this._fetchResults({
      collectionName,
      selector: selector || {},
      options: options || {},
    });
  }

  find(collectionName, selector = {}, options = {}) {
    this._assertOpen('find');
    return new AFSCursor(this, collectionName, selector, options);
  }

  // ---------------------------------------------------------------------------
  // Indexes (no-op for an in-memory store)
  // ---------------------------------------------------------------------------

  async createIndexAsync(_collectionName, _index, _options) {
    this._assertOpen('createIndexAsync');
    // No-op: in-memory store does not need indexes.
  }

  async dropIndexAsync(_collectionName, _indexName) {
    this._assertOpen('dropIndexAsync');
  }

  async dropCollectionAsync(collectionName) {
    this._assertOpen('dropCollectionAsync');
    this._store.delete(collectionName);
    this._notifyCollectionChanged(collectionName);
  }

  // ---------------------------------------------------------------------------
  // _fetchModifyWrite hooks
  // ---------------------------------------------------------------------------

  /** @protected */
  async _lockMatching(collectionName, selector, opts) {
    const coll = this._getCollection(collectionName);
    const ast = (selector && Object.keys(selector).length > 0)
      ? parseSelector(selector)
      : null;
    const out = [];
    for (const doc of coll.values()) {
      if (!ast || match(doc, ast)) {
        // Clone so the loop's applyModifier mutates a private copy. _writeRow
        // installs the clone in the store. If a retry path runs (synthetic
        // conflict in tests), each attempt gets a fresh clone — safe for
        // non-idempotent modifiers.
        out.push(EJSON.clone(doc));
        if (!opts.multi) break;
      }
    }
    return out;
  }

  /** @protected */
  async _writeRow(collectionName, row, _originalRow, opts) {
    const coll = this._getCollection(collectionName);
    if (opts.isInsert) {
      if (row._id == null) row._id = this.generateId(collectionName);
      coll.set(row._id, row);
      return;
    }
    coll.set(row._id, row);
  }

  /** @protected */
  _isRetryableConflict(_err) {
    // No concurrency in-memory; retries are never warranted.
    return false;
  }

  /**
   * Same heuristic as PostgresStreamProvider: copy scalar equality fields
   * out of selector, skip operator-only inner objects, seed an _id.
   * @protected
   */
  _buildInsertDoc(selector, _modifier) {
    const doc = {};
    if (selector && typeof selector === 'object') {
      for (const [k, v] of Object.entries(selector)) {
        if (k.startsWith('$')) continue;
        if (v === null || v === undefined) continue;
        if (typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
          // Mongo's first-key heuristic. A mixed inner object like
          // `{addr: {street: 'x', $exists: true}}` is copied wholesale
          // (first key is non-`$`), matching neither strict Mongo (which
          // rejects it) nor a strict operator-stripping pass. Worth
          // knowing for adapter authors who reuse this shape.
          const subKeys = Object.keys(v);
          if (subKeys.length > 0 && subKeys[0].startsWith('$')) continue;
        }
        doc[k] = v;
      }
    }
    if (!doc._id) doc._id = this.generateId();
    return doc;
  }

  // ---------------------------------------------------------------------------
  // Push notification helper
  // ---------------------------------------------------------------------------

  /**
   * Trigger an immediate poll on every active cursor that targets
   * `collectionName`. CRUD paths invoke this so observers see writes without
   * waiting for the cadence timer.
   * @protected
   */
  _notifyCollectionChanged(collectionName) {
    // Snapshot defensively: requestImmediatePoll → _runPoll → _stopPoller is
    // a plausible mutation path during iteration on a future code change.
    for (const ctx of Array.from(this._pollers.values())) {
      if (ctx.cursorDescription &&
          ctx.cursorDescription.collectionName === collectionName) {
        this.requestImmediatePoll(ctx.cursorDescription);
      }
    }
  }
}

// =============================================================================
// In-memory sort / projection helpers
// =============================================================================

function getPath(doc, path) {
  let cur = doc;
  for (const seg of path) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortDocs(docs, sortAst) {
  const keys = sortAst.keys || [];
  if (keys.length === 0) return docs;
  return docs.slice().sort((da, db) => {
    for (const k of keys) {
      const av = getPath(da, k.path);
      const bv = getPath(db, k.path);
      const cmp = compareValues(av, bv);
      if (cmp !== 0) return k.direction === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function projectDoc(doc, projAst) {
  const out = {};
  if (projAst.mode === 'exclude') {
    // Copy everything except listed exclusions (top-level only — sufficient
    // for the mock).
    const exclude = new Set(projAst.fields.map(f => f.path[0]));
    for (const k of Object.keys(doc)) {
      if (!exclude.has(k)) out[k] = doc[k];
    }
    return out;
  }
  // include / mixed: copy listed fields; honor _id default unless explicitly
  // excluded.
  for (const f of projAst.fields) {
    if (f.include === false) continue;
    const key = f.path[0];
    if (key in doc) out[key] = doc[key];
  }
  return out;
}
