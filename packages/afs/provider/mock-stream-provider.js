import { StreamProvider } from './stream-provider';
import { ChangeStream } from '../reactive/change-stream';

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
    // Reopen a previously-closed provider so CRUD/observe can be used again.
    this._state = 'open';
  }

  async close() {
    this._localCollections = {};
    await super.close();
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
    // Use the async LC API so the observe queue drain is awaited; otherwise
    // bridge.added fires on a later microtask and observers see stale state
    // when the test inspects them right after the await.
    await lc.insertAsync(cloned);
    return cloned._id;
  }

  async updateAsync(collectionName, selector, modifier, options = {}) {
    const lc = this._getLocalCollection(collectionName);
    return lc.updateAsync(selector, modifier, options);
  }

  async removeAsync(collectionName, selector) {
    const lc = this._getLocalCollection(collectionName);
    return lc.removeAsync(selector);
  }

  async findOneAsync(collectionName, selector, options = {}) {
    const lc = this._getLocalCollection(collectionName);
    return lc.findOne(selector, options);
  }

  async upsertAsync(collectionName, selector, modifier, options = {}) {
    const lc = this._getLocalCollection(collectionName);
    return lc.updateAsync(selector, modifier, { ...options, upsert: true });
  }

  // ---------------------------------------------------------------------------
  // Count
  // ---------------------------------------------------------------------------

  async countAsync(collectionName, selector, options = {}) {
    const lc = this._getLocalCollection(collectionName);
    return lc.find(selector, options).count();
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
  async fetchResults(collectionName, selector, options) {
    const lc = this._getLocalCollection(collectionName);
    return lc.find(selector, options).fetch();
  }

  // ---------------------------------------------------------------------------
  // Observers
  // ---------------------------------------------------------------------------

  async observeChanges(cursorDescription, ordered, callbacks, options = {}) {
    if (ordered) {
      throw new Error('MockStreamProvider does not support ordered observes');
    }
    const lc = this._getLocalCollection(cursorDescription.collectionName);
    const cursor = lc.find(
      cursorDescription.selector,
      cursorDescription.options || {}
    );
    return cursor.observeChanges(callbacks);
  }

  // ---------------------------------------------------------------------------
  // EventEmitter-based reactive support
  // ---------------------------------------------------------------------------

  supportsEventEmitter() {
    return true;
  }

  startObserving(cursorDescription, ordered) {
    const stream = this.createChangeStream(cursorDescription);
    const lc = this._getLocalCollection(cursorDescription.collectionName);
    const cursor = lc.find(
      cursorDescription.selector,
      cursorDescription.options || {}
    );

    // Bridge LocalCollection's observeChanges into the ChangeStream.
    // We defer setup to a microtask so that the caller can attach
    // listeners (via ObserveMultiplexer) before initial adds fire.
    const bridgeCallbacks = ordered
      ? {
          addedBefore(id, fields, before) { stream.addedBefore(id, fields, before); },
          movedBefore(id, before) { stream.movedBefore(id, before); },
          changed(id, fields) { stream.changed(id, fields); },
          removed(id) { stream.removed(id); },
        }
      : {
          added(id, fields) { stream.added(id, fields); },
          changed(id, fields) { stream.changed(id, fields); },
          removed(id) { stream.removed(id); },
        };

    // Defer to the next microtask so the ObserveMultiplexer has time to bind
    // its listeners. Use observeChangesAsync so initial adds drain (the
    // server-side LocalCollection queue is asynchronous) before markReady,
    // otherwise the multiplexer snapshots an empty cache and the consumer
    // misses the seed events.
    Promise.resolve().then(async () => {
      if (stream.isStopped()) return;
      const lcHandle = await cursor.observeChangesAsync(bridgeCallbacks);
      if (stream.isStopped()) {
        lcHandle.stop();
        return;
      }
      stream.markReady();

      // Use onStopOrImmediate so a stop() raced during the microtask gap
      // still frees the LocalCollection observer we just created.
      stream.onStopOrImmediate(() => {
        lcHandle.stop();
      });
    }).catch(err => {
      if (!stream.isStopped()) {
        stream.markError(err);
      }
    });

    return stream;
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
  // Collection drop
  // ---------------------------------------------------------------------------

  async dropCollectionAsync(collectionName) {
    delete this._localCollections[collectionName];
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
