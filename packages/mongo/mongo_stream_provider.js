/**
 * MongoStreamProvider - AFS StreamProvider implementation for MongoDB.
 *
 * Wraps the existing MongoConnection and observe infrastructure to participate
 * in the AFS abstraction layer. This is created automatically when the afs
 * package is available and registers MongoDB as the default provider.
 *
 * This file does NOT change any existing Mongo.Collection behavior. It only
 * adds AFS integration when the afs package is present.
 */

let StreamProviderBase;

// Get StreamProvider base class from AFS if available
if (Package.afs) {
  StreamProviderBase = Package.afs.AFS.StreamProvider;
} else {
  // Fallback: use a plain class if AFS is not loaded
  StreamProviderBase = class StreamProviderBase {
    constructor(options = {}) {
      this.name = options.name || 'unknown';
      this._connected = false;
      this._collections = new Map();
    }
    isConnected() { return this._connected; }
    registerCollection(name, collection) { this._collections.set(name, collection); }
    getCollection(name) { return this._collections.get(name); }
  };
}

export class MongoStreamProvider extends StreamProviderBase {
  /**
   * @param {MongoConnection} mongoConnection - The existing MongoConnection instance
   */
  constructor(mongoConnection) {
    super({ name: 'mongo' });
    this._mongo = mongoConnection;
    this._connected = true;
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  async connect() {
    if (this._mongo.client) {
      await this._mongo.client.connect();
    }
    this._connected = true;
  }

  async close() {
    if (this._mongo.client) {
      await this._mongo.client.close();
    }
    this._connected = false;
  }

  // ---------------------------------------------------------------------------
  // CRUD operations - delegate to MongoConnection
  // ---------------------------------------------------------------------------

  async insertAsync(collectionName, doc) {
    return this._mongo.insertAsync(collectionName, doc);
  }

  async updateAsync(collectionName, selector, modifier, options = {}) {
    return this._mongo.updateAsync(collectionName, selector, modifier, options);
  }

  async removeAsync(collectionName, selector) {
    return this._mongo.removeAsync(collectionName, selector);
  }

  async findOneAsync(collectionName, selector, options = {}) {
    return this._mongo.findOneAsync(collectionName, selector, options);
  }

  async upsertAsync(collectionName, selector, modifier, options = {}) {
    return this._mongo.upsertAsync(collectionName, selector, modifier, options);
  }

  // ---------------------------------------------------------------------------
  // Query / Cursor
  // ---------------------------------------------------------------------------

  find(collectionName, selector = {}, options = {}) {
    return this._mongo.find(collectionName, selector, options);
  }

  /**
   * Fetch query results. Used internally by AFSCursor.
   * @private
   */
  async _fetchResults(collectionName, selector, options) {
    const cursor = this._mongo.find(collectionName, selector, options);
    return cursor.fetchAsync();
  }

  // ---------------------------------------------------------------------------
  // Reactive observers - delegate to MongoConnection._observeChanges
  // ---------------------------------------------------------------------------

  async observeChanges(cursorDescription, ordered, callbacks, options = {}) {
    return this._mongo._observeChanges(
      cursorDescription,
      ordered,
      callbacks,
      options.nonMutatingCallbacks
    );
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  async createIndexAsync(collectionName, index, options) {
    return this._mongo.createIndexAsync(collectionName, index, options);
  }

  async dropIndexAsync(collectionName, indexName) {
    return this._mongo.dropIndexAsync(collectionName, indexName);
  }

  // ---------------------------------------------------------------------------
  // Raw access
  // ---------------------------------------------------------------------------

  rawDatabase() {
    return this._mongo.db;
  }

  rawCollection(collectionName) {
    return this._mongo.rawCollection(collectionName);
  }

  // ---------------------------------------------------------------------------
  // ID generation (MongoDB-compatible)
  // ---------------------------------------------------------------------------

  generateId(collectionName) {
    const src = collectionName
      ? DDP.randomStream('/collection/' + collectionName)
      : Random.insecure;
    return src.id();
  }

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------

  capabilities() {
    return {
      reactiveQueries: true,
      transactions: true,
      changeStreams: true,
      oplog: !!this._mongo._oplogHandle,
      fullTextSearch: true,
      geoQueries: true,
      aggregation: true,
      joins: false, // MongoDB doesn't have native joins ($lookup is aggregation-level)
      upsert: true,
    };
  }

  // ---------------------------------------------------------------------------
  // MongoDB-specific methods
  // ---------------------------------------------------------------------------

  /**
   * Get the underlying MongoConnection instance.
   * @returns {MongoConnection}
   */
  getMongoConnection() {
    return this._mongo;
  }

  /**
   * Check if oplog tailing is available.
   * @returns {boolean}
   */
  hasOplog() {
    return !!this._mongo._oplogHandle;
  }

  /**
   * Run a MongoDB aggregation pipeline.
   * @param {string} collectionName
   * @param {Array} pipeline
   * @param {Object} [options]
   * @returns {Promise<Array>}
   */
  async aggregate(collectionName, pipeline, options = {}) {
    const collection = this._mongo.rawCollection(collectionName);
    return collection.aggregate(pipeline, options).toArray();
  }

  /**
   * Drop a collection.
   * @param {string} collectionName
   * @returns {Promise<void>}
   */
  async dropCollectionAsync(collectionName) {
    return this._mongo.dropCollectionAsync(collectionName);
  }
}

/**
 * Register MongoStreamProvider with AFS if the afs package is loaded.
 * Called from the mongo package initialization.
 */
export function registerMongoWithAFS() {
  if (!Package.afs) return;

  const { AFS } = Package.afs;
  const driver = MongoInternals.defaultRemoteCollectionDriver();

  if (!driver || !driver.mongo) return;

  const mongoProvider = new MongoStreamProvider(driver.mongo);
  AFS.registerProvider('mongo', mongoProvider);
  AFS.setDefaultProvider('mongo');

  if (typeof AFS.registerCoreResolver === 'function' &&
      typeof Mongo !== 'undefined' && typeof Mongo.getCollection === 'function') {
    AFS.registerCoreResolver(name => Mongo.getCollection(name));
  }

  return mongoProvider;
}
