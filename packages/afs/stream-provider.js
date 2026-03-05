/**
 * StreamProvider - Abstract base class for all AFS data source adapters.
 *
 * Each data source (MongoDB, PostgreSQL, Redis, Kafka, etc.) implements this
 * interface to participate in Meteor's reactive data system. A StreamProvider
 * handles all communication with the underlying data store.
 *
 * Subclasses MUST implement: connect, close, insertAsync, updateAsync,
 * removeAsync, find, observeChanges.
 *
 * Subclasses SHOULD implement: findOneAsync, upsertAsync, createIndexAsync,
 * dropIndexAsync, rawDatabase, rawCollection, capabilities.
 */
export class StreamProvider {
  /**
   * @param {Object} options
   * @param {string} options.name - Human-readable provider name (e.g., 'mongo', 'postgres')
   */
  constructor(options = {}) {
    if (new.target === StreamProvider) {
      throw new Error('StreamProvider is abstract and cannot be instantiated directly');
    }
    this.name = options.name || 'unknown';
    this._connected = false;
    this._collections = new Map();
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Establish connection to the data source.
   * @returns {Promise<void>}
   */
  async connect() {
    throw new Error(`${this.constructor.name}.connect() must be implemented`);
  }

  /**
   * Close the connection to the data source.
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error(`${this.constructor.name}.close() must be implemented`);
  }

  /**
   * @returns {boolean} Whether this provider is currently connected
   */
  isConnected() {
    return this._connected;
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  /**
   * Insert a document into a collection.
   * @param {string} collectionName
   * @param {Object} doc - The document to insert (may or may not have _id)
   * @returns {Promise<string>} The _id of the inserted document
   */
  async insertAsync(collectionName, doc) {
    throw new Error(`${this.constructor.name}.insertAsync() must be implemented`);
  }

  /**
   * Update documents matching a selector.
   * @param {string} collectionName
   * @param {Object} selector - MongoDB-style selector
   * @param {Object} modifier - MongoDB-style modifier ($set, $unset, etc.)
   * @param {Object} [options]
   * @param {boolean} [options.multi=false] - Update multiple documents
   * @param {boolean} [options.upsert=false] - Insert if no match found
   * @returns {Promise<number>} Number of affected documents
   */
  async updateAsync(collectionName, selector, modifier, options) {
    throw new Error(`${this.constructor.name}.updateAsync() must be implemented`);
  }

  /**
   * Remove documents matching a selector.
   * @param {string} collectionName
   * @param {Object} selector - MongoDB-style selector
   * @returns {Promise<number>} Number of removed documents
   */
  async removeAsync(collectionName, selector) {
    throw new Error(`${this.constructor.name}.removeAsync() must be implemented`);
  }

  /**
   * Find a single document matching the selector.
   * @param {string} collectionName
   * @param {Object} selector - MongoDB-style selector
   * @param {Object} [options]
   * @returns {Promise<Object|undefined>}
   */
  async findOneAsync(collectionName, selector, options) {
    // Default implementation using find().fetchAsync()
    const cursor = this.find(collectionName, selector, { ...options, limit: 1 });
    const docs = await cursor.fetchAsync();
    return docs[0];
  }

  /**
   * Upsert: update if exists, insert if not.
   * @param {string} collectionName
   * @param {Object} selector
   * @param {Object} modifier
   * @param {Object} [options]
   * @returns {Promise<{numberAffected: number, insertedId?: string}>}
   */
  async upsertAsync(collectionName, selector, modifier, options) {
    return this.updateAsync(collectionName, selector, modifier, {
      ...options,
      upsert: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Query / Cursor support
  // ---------------------------------------------------------------------------

  /**
   * Create a cursor for querying a collection.
   * @param {string} collectionName
   * @param {Object} [selector={}] - MongoDB-style selector
   * @param {Object} [options={}] - sort, skip, limit, projection, transform
   * @returns {AFSCursor} A cursor implementing the Meteor cursor interface
   */
  find(collectionName, selector, options) {
    throw new Error(`${this.constructor.name}.find() must be implemented`);
  }

  // ---------------------------------------------------------------------------
  // Reactive observer support
  // ---------------------------------------------------------------------------

  /**
   * Observe changes to a query result set. This is the core reactive primitive.
   *
   * @param {Object} cursorDescription - Describes the query (collectionName, selector, options)
   * @param {boolean} ordered - Whether to track document ordering
   * @param {Object} callbacks - { added, changed, removed } or { addedBefore, changed, movedBefore, removed }
   * @param {Object} [options]
   * @returns {Promise<{stop: Function}>} An observe handle with a stop() method
   */
  async observeChanges(cursorDescription, ordered, callbacks, options) {
    throw new Error(`${this.constructor.name}.observeChanges() must be implemented`);
  }

  /**
   * Notify the system that a change occurred (for providers that push changes).
   * @param {string} collectionName
   * @param {Object} change - { type: 'added'|'changed'|'removed', id, fields, doc }
   */
  async publishChange(collectionName, change) {
    // Optional: override in providers that push changes externally
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  /**
   * Create an index on a collection.
   * @param {string} collectionName
   * @param {Object} index - Index specification (e.g., { fieldName: 1 })
   * @param {Object} [options] - Index options (unique, sparse, name, etc.)
   * @returns {Promise<void>}
   */
  async createIndexAsync(collectionName, index, options) {
    throw new Error(`${this.constructor.name}.createIndexAsync() must be implemented`);
  }

  /**
   * Drop an index from a collection.
   * @param {string} collectionName
   * @param {string} indexName
   * @returns {Promise<void>}
   */
  async dropIndexAsync(collectionName, indexName) {
    throw new Error(`${this.constructor.name}.dropIndexAsync() must be implemented`);
  }

  // ---------------------------------------------------------------------------
  // Raw access (adapter-specific escape hatch)
  // ---------------------------------------------------------------------------

  /**
   * Get the raw database client for this provider.
   * Returns adapter-specific objects (e.g., MongoDB Db, pg Pool).
   * @returns {Object|null}
   */
  rawDatabase() {
    return null;
  }

  /**
   * Get the raw collection/table handle for adapter-specific operations.
   * @param {string} collectionName
   * @returns {Object|null}
   */
  rawCollection(collectionName) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // ID generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a new document ID for a collection.
   * Override to use database-native ID formats (UUID, serial, ObjectID, etc.)
   * @param {string} collectionName
   * @returns {string|Object} A new unique ID
   */
  generateId(collectionName) {
    return Random.id();
  }

  // ---------------------------------------------------------------------------
  // Type conversion
  // ---------------------------------------------------------------------------

  /**
   * Convert a Meteor document to the store's native format before writing.
   * @param {Object} doc
   * @returns {Object}
   */
  convertToStoreType(doc) {
    return doc;
  }

  /**
   * Convert a document from the store's native format after reading.
   * @param {Object} doc
   * @returns {Object}
   */
  convertFromStoreType(doc) {
    return doc;
  }

  // ---------------------------------------------------------------------------
  // Schema support
  // ---------------------------------------------------------------------------

  /**
   * Whether this provider supports schema-driven migrations.
   * @returns {boolean}
   */
  supportsSchema() {
    return false;
  }

  /**
   * Apply a schema migration for a collection.
   * @param {string} collectionName
   * @param {Object} schema - Schema definition
   * @returns {Promise<void>}
   */
  async migrateSchema(collectionName, schema) {
    // Optional: override in providers with schema support
  }

  // ---------------------------------------------------------------------------
  // Capabilities declaration
  // ---------------------------------------------------------------------------

  /**
   * Declare what this provider supports. Used by FederatedCollection and
   * the adaptive engine to optimize behavior.
   * @returns {Object}
   */
  capabilities() {
    return {
      reactiveQueries: false,
      transactions: false,
      changeStreams: false,
      oplog: false,
      fullTextSearch: false,
      geoQueries: false,
      aggregation: false,
      joins: false,
      upsert: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Collection tracking
  // ---------------------------------------------------------------------------

  /**
   * Register a collection with this provider.
   * @param {string} name
   * @param {Object} collection - The FederatedCollection instance
   */
  registerCollection(name, collection) {
    this._collections.set(name, collection);
  }

  /**
   * Get a registered collection by name.
   * @param {string} name
   * @returns {Object|undefined}
   */
  getCollection(name) {
    return this._collections.get(name);
  }
}
