import { StreamProvider } from './stream-provider';

/**
 * MockStreamProvider - An in-memory StreamProvider for testing.
 *
 * Uses Minimongo (LocalCollection) under the hood to provide a fully functional
 * StreamProvider without any external database dependency.
 *
 * Usage:
 *   const provider = new MockStreamProvider();
 *   const collection = new AFS.Collection('test', { provider });
 */
export class MockStreamProvider extends StreamProvider {
  constructor(options = {}) {
    super({ name: 'mock', ...options });
    this._localCollections = {};
    this._connected = true;
  }

  async connect() {
    this._connected = true;
  }

  async close() {
    this._connected = false;
    this._localCollections = {};
  }

  _getLocalCollection(collectionName) {
    if (!this._localCollections[collectionName]) {
      this._localCollections[collectionName] = new LocalCollection(collectionName);
    }
    return this._localCollections[collectionName];
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async insertAsync(collectionName, doc) {
    const lc = this._getLocalCollection(collectionName);
    const cloned = EJSON.clone(doc);
    if (!cloned._id) {
      cloned._id = this.generateId(collectionName);
    }
    lc.insert(cloned);
    return cloned._id;
  }

  async updateAsync(collectionName, selector, modifier, options = {}) {
    const lc = this._getLocalCollection(collectionName);
    return lc.update(selector, modifier, options);
  }

  async removeAsync(collectionName, selector) {
    const lc = this._getLocalCollection(collectionName);
    return lc.remove(selector);
  }

  async findOneAsync(collectionName, selector, options = {}) {
    const lc = this._getLocalCollection(collectionName);
    return lc.findOne(selector, options);
  }

  async upsertAsync(collectionName, selector, modifier, options = {}) {
    const lc = this._getLocalCollection(collectionName);
    return lc.upsert(selector, modifier, options);
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  find(collectionName, selector = {}, options = {}) {
    // Return a LocalCollection cursor directly
    // It already implements the full Meteor cursor interface
    const lc = this._getLocalCollection(collectionName);
    return lc.find(selector, options);
  }

  /**
   * Fetch results for AFSCursor. Used internally.
   * @private
   */
  async _fetchResults(collectionName, selector, options) {
    const lc = this._getLocalCollection(collectionName);
    return lc.find(selector, options).fetch();
  }

  // ---------------------------------------------------------------------------
  // Observers
  // ---------------------------------------------------------------------------

  async observeChanges(cursorDescription, ordered, callbacks, options = {}) {
    const lc = this._getLocalCollection(cursorDescription.collectionName);
    const cursor = lc.find(
      cursorDescription.selector,
      cursorDescription.options || {}
    );

    if (ordered) {
      return cursor.observeChanges(callbacks);
    }

    return cursor.observeChanges(callbacks);
  }

  // ---------------------------------------------------------------------------
  // Index (no-op for mock)
  // ---------------------------------------------------------------------------

  async createIndexAsync(collectionName, index, options) {
    // No-op: in-memory collections don't need indexes
  }

  async dropIndexAsync(collectionName, indexName) {
    // No-op
  }

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------

  capabilities() {
    return {
      reactiveQueries: true,
      transactions: false,
      changeStreams: false,
      oplog: false,
      fullTextSearch: false,
      geoQueries: true, // Minimongo supports $near
      aggregation: false,
      joins: false,
      upsert: true,
    };
  }
}
