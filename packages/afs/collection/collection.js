import { EventEmitter } from 'events';
import { AFSCursor } from './cursor';
import { createIdGenerator } from './id-generator';
import {
  openLocalCollection,
  forgetLocalCollection,
} from './local-collection-driver';
import { makeClientStore, makeServerStore } from './replication-store';
import { CollectionExtensions, installStatics } from './extensions';

/**
 * FederatedCollection - A collection that works with any StreamProvider.
 *
 * On the server, operations are delegated to the StreamProvider.
 * On the client, operations use Minimongo + DDP sync (identical to Mongo.Collection).
 *
 * This class implements the same interface as Mongo.Collection, so it can be
 * used interchangeably in publications, methods, templates, and application code.
 */
export class FederatedCollection extends EventEmitter {
  /**
   * @param {string|null} name - Collection name. null for local-only collections.
   * @param {Object} [options]
   * @param {StreamProvider} [options.provider] - The data source provider (server only)
   * @param {string} [options.idGeneration='STRING'] - ID generation strategy: 'STRING' or 'UUID'
   * @param {Function} [options.transform] - Document transform function
   * @param {Object} [options.connection] - DDP connection (default: auto-detect)
   * @param {boolean} [options.defineMutationMethods=true] - Whether to register DDP mutation methods
   * @param {boolean} [options._preventAutopublish=false] - Prevent auto-publishing
   */
  constructor(name, options = {}) {
    super();
    this.setMaxListeners(0);

    if (!name && name !== null) {
      Meteor._debug(
        'Warning: creating anonymous AFS collection. It will not be ' +
        'saved or synchronized over the network. (Pass null to suppress this warning.)'
      );
      name = null;
    }

    if (name !== null && typeof name !== 'string') {
      throw new Error(
        'First argument to new AFS.Collection must be a string or null'
      );
    }

    this._name = name;
    this._provider = options.provider || null;
    this._providerName =
      (options.provider && options.provider.name) ||
      options.providerName ||
      null;
    this._transform = LocalCollection.wrapTransform(options.transform || null);
    this.resolverType = options.resolverType;

    this._makeNewID = createIdGenerator(name, options.idGeneration || 'STRING');

    this._connection = this._setupConnection(name, options);
    this._setupStorage(name, options);

    this._settingUpReplicationPromise = this._maybeSetUpReplication(name);

    if (options.defineMutationMethods !== false) {
      this._setupMutationMethods(name, options);
    }

    this._setupAutopublish(name, options);

    if (name && typeof AFS !== 'undefined') {
      AFS.registerCollection(name, this);
    }

    CollectionExtensions.applyExtensions(this, name, options);
  }

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  /**
   * Find documents matching a selector.
   * @param {Object} [selector={}] - MongoDB-style query selector
   * @param {Object} [options] - sort, skip, limit, projection, transform
   * @returns {Object} A cursor (AFSCursor on server, Minimongo cursor on client)
   */
  find(selector, options) {
    if (arguments.length === 0) {
      selector = {};
    }

    options = this._getFindOptions(options);

    if (Meteor.isServer && this._provider) {
      if (typeof AFS !== 'undefined' && AFS._engine) {
        AFS._engine.recordAccess(this._name, selector, options);
      }

      return new AFSCursor(
        this._provider,
        this._name,
        this._rewriteSelector(selector),
        options
      );
    }

    return this._collection.find(
      this._rewriteSelector(selector),
      options
    );
  }

  /**
   * Find a single document (async).
   */
  async findOneAsync(selector, options) {
    if (arguments.length === 0) {
      selector = {};
    }
    options = this._getFindOptions(options);

    if (this._provider) {
      const result = await this._provider.findOneAsync(
        this._name,
        this._rewriteSelector(selector),
        options
      );
      if (result && this._transform) {
        return this._transform(result);
      }
      return result;
    }

    return this._collection.findOneAsync(
      this._rewriteSelector(selector),
      options
    );
  }

  // ---------------------------------------------------------------------------
  // Mutation methods (async - primary API for Meteor 3+)
  // ---------------------------------------------------------------------------

  async insertAsync(doc) {
    if (!doc) {
      throw new Error('insertAsync requires a document argument');
    }

    doc = EJSON.clone(doc);

    if (!doc._id) {
      doc._id = this._makeNewID();
    }

    if (this._isRemoteCollection()) {
      this._assertHasMutationMethods('insertAsync');
      return this._callMutatorMethodAsync('insertAsync', [doc]);
    }

    if (this._provider && Meteor.isServer) {
      this.emit('before:insert', { doc });
      const id = await this._provider.insertAsync(this._name, doc);
      this.emit('after:insert', { doc, id });
      this._recordWrite();
      return id;
    }

    return this._collection.insertAsync(doc);
  }

  async updateAsync(selector, modifier, options = {}) {
    selector = this._rewriteSelector(selector);

    if (this._isRemoteCollection()) {
      this._assertHasMutationMethods('updateAsync');
      return this._callMutatorMethodAsync('updateAsync', [selector, modifier, options]);
    }

    if (this._provider && Meteor.isServer) {
      this.emit('before:update', { selector, modifier, options });
      const result = await this._provider.updateAsync(this._name, selector, modifier, options);
      this.emit('after:update', { selector, modifier, options, result });
      this._recordWrite();
      return result;
    }

    return this._collection.updateAsync(selector, modifier, options);
  }

  async removeAsync(selector) {
    selector = this._rewriteSelector(selector);

    if (this._isRemoteCollection()) {
      this._assertHasMutationMethods('removeAsync');
      return this._callMutatorMethodAsync('removeAsync', [selector]);
    }

    if (this._provider && Meteor.isServer) {
      this.emit('before:remove', { selector });
      const result = await this._provider.removeAsync(this._name, selector);
      this.emit('after:remove', { selector, result });
      this._recordWrite();
      return result;
    }

    return this._collection.removeAsync(selector);
  }

  /**
   * Upsert: update or insert.
   *
   * NOTE on allow/deny: client-invoked upserts on a collection that has
   * `allow`/`deny` rules are rejected server-side by allow-deny's
   * `_validatedUpdateAsync`, which refuses `upsert: true`. This matches
   * `Mongo.Collection` behavior — upserts via DDP only work in insecure
   * mode or from trusted server code. If you need upsert on a restricted
   * collection, wrap it in a Meteor method.
   */
  async upsertAsync(selector, modifier, options = {}) {
    return this.updateAsync(selector, modifier, { ...options, upsert: true });
  }

  // ---------------------------------------------------------------------------
  // Index methods
  // ---------------------------------------------------------------------------

  async createIndexAsync(index, options) {
    if (this._provider) {
      return this._provider.createIndexAsync(this._name, index, options);
    }
    if (this._collection.createIndexAsync) {
      return this._collection.createIndexAsync(index, options);
    }
    throw new Error(
      `createIndexAsync is not available on collection "${this._name}"`
    );
  }

  async dropIndexAsync(indexName) {
    if (this._provider) {
      return this._provider.dropIndexAsync(this._name, indexName);
    }
    if (this._collection.dropIndexAsync) {
      return this._collection.dropIndexAsync(indexName);
    }
    throw new Error(
      `dropIndexAsync is not available on collection "${this._name}"`
    );
  }

  // ---------------------------------------------------------------------------
  // Raw access
  // ---------------------------------------------------------------------------

  rawDatabase() {
    if (this._provider) {
      return this._provider.rawDatabase();
    }
    throw new Error('rawDatabase is only available on server collections with a provider');
  }

  rawCollection() {
    if (this._provider) {
      return this._provider.rawCollection(this._name);
    }
    throw new Error('rawCollection is only available on server collections with a provider');
  }

  // ---------------------------------------------------------------------------
  // Collection info
  // ---------------------------------------------------------------------------

  _isRemoteCollection() {
    return this._connection && this._connection !== Meteor.server;
  }

  /**
   * Throws a clear error when a DDP mutator is invoked but no mutation
   * methods were defined (`defineMutationMethods: false`).
   * @private
   */
  _assertHasMutationMethods(methodName) {
    if (typeof this._prefix !== 'string') {
      throw new Error(
        `AFS.Collection("${this._name}"): cannot call ${methodName} over DDP ` +
        `because mutation methods were not defined ` +
        `(defineMutationMethods: false was passed to the constructor).`
      );
    }
  }

  _getCollectionName() {
    return this._name;
  }

  /**
   * Route a write event through the adaptive engine (single place, so
   * accounting stays accurate even if mutation surfaces multiply).
   * @private
   */
  _recordWrite() {
    if (typeof AFS !== 'undefined' && AFS._engine && AFS._engine.recordWrite) {
      AFS._engine.recordWrite(this._name);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Setup methods
  // ---------------------------------------------------------------------------

  _setupConnection(name, options) {
    if (!name || options.connection === null) return null;
    if (options.connection) return options.connection;
    return Meteor.isClient ? Meteor.connection : Meteor.server;
  }

  _setupStorage(name, options) {
    if (Meteor.isServer && this._provider) {
      // Server with provider: wrap the StreamProvider with a
      // LocalCollection-shaped adapter the replication store can talk to.
      this._collection = this._createProviderAdapter();
    } else {
      this._collection = openLocalCollection(
        this._providerName,
        name,
        this._connection
      );
    }
  }

  /**
   * Adapter so the server-side replication store can treat the provider
   * like a LocalCollection. Reads delegate to the provider directly;
   * writes go through the collection's public async mutators so they
   * emit lifecycle events and count toward engine metrics exactly once
   * (do NOT re-implement those here — that was the source of double
   * counting before).
   * @private
   */
  _createProviderAdapter() {
    const provider = this._provider;
    const collectionName = this._name;
    const self = this;

    return {
      findOneAsync: (selector, options) =>
        provider.findOneAsync(collectionName, selector, options),
      find: (selector, options) =>
        provider.find(collectionName, selector, options),

      // Mutation surfaces route through the collection's own mutators so
      // lifecycle events and engine metrics fire in exactly one place.
      insertAsync: (doc) => self.insertAsync(doc),
      updateAsync: (selector, modifier, options) =>
        self.updateAsync(selector, modifier, options),
      removeAsync: (selector) => self.removeAsync(selector),

      countDocuments: (selector, options) =>
        provider.countAsync(collectionName, selector, options),
      estimatedDocumentCount: (options) =>
        provider.countAsync(collectionName, {}, options),

      // Required by the DDP replication store.
      saveOriginals() {},
      retrieveOriginals() { return null; },
      pauseObservers() {},
      resumeObserversClient() {},
      async resumeObserversServer() {},

      _docs: {
        async get(id) {
          return provider.findOneAsync(collectionName, { _id: id });
        },
      },
    };
  }

  _setupMutationMethods(name, options) {
    if (typeof this._defineMutationMethods !== 'function') return;
    try {
      this._defineMutationMethods({
        useExisting: options._suppressSameNameError === true,
      });
    } catch (error) {
      // DDP throws "A method named '<path>' is already defined" when
      // registering a duplicate method. Translate it to a collection-named
      // -once error. Matched by substring so a reword of the DDP message
      // (or a different mutator suffix landing first) still triggers the
      // translation instead of leaking the raw DDP error.
      if (typeof error.message === 'string'
          && error.message.includes('A method named')
          && error.message.includes(`'/${name}/`)) {
        throw new Error(`There is already a collection named "${name}"`);
      }
      throw error;
    }
  }

  _setupAutopublish(name, options) {
    // Meteor's publish() returns void — there is no handle to capture and
    // the universal-publish list has no public un-publish API. A recreated
    // collection with the same name under autopublish will therefore
    // double up. Applications that hot-reload collections under autopublish
    // should drop the autopublish package; production code should not
    // rely on un-publishing.
    if (
      Package.autopublish &&
      !options._preventAutopublish &&
      this._connection &&
      this._connection.publish
    ) {
      this._connection.publish(null, () => this.find(), { is_auto: true });
    }
  }

  _rewriteSelector(selector, { fallbackId } = {}) {
    if (LocalCollection._selectorIsId(selector)) {
      selector = { _id: selector };
    }

    if (Array.isArray(selector)) {
      throw new Error("Selector can't be an array.");
    }

    // Missing selector: forge an unmatchable _id so write paths with no
    // selector do not accidentally match every document.
    if (selector === undefined || selector === null) {
      return { _id: fallbackId || Random.id() };
    }

    // Selector is present but contains an explicitly falsy _id. Silently
    // rewriting would destroy valid IDs like { _id: 0 } or { _id: false }
    // and silently turn a bad query into "match nothing". Surface it loudly.
    if ('_id' in selector && !selector._id) {
      throw new Error(
        `Invalid selector on collection "${this._name}": _id is ${JSON.stringify(selector._id)}`
      );
    }

    return selector;
  }

  _getFindOptions(options) {
    if (!options) {
      return { transform: this._transform };
    }

    if (options.fields && !options.projection) {
      options = { ...options, projection: options.fields };
      delete options.fields;
    }

    return {
      transform: this._transform,
      ...options,
    };
  }

  // ---------------------------------------------------------------------------
  // DDP Replication (client-server sync)
  // ---------------------------------------------------------------------------

  async _maybeSetUpReplication(name) {
    if (
      !(
        this._connection &&
        this._connection.registerStoreClient &&
        this._connection.registerStoreServer
      )
    ) {
      return;
    }

    const store = Meteor.isClient
      ? makeClientStore(this)
      : makeServerStore(this);

    const registerStoreResult = Meteor.isClient
      ? this._connection.registerStoreClient(name, store)
      : this._connection.registerStoreServer(name, store);

    const message = `There is already a collection named "${name}"`;
    const logWarn = () => {
      (console.warn || console.log)(message);
    };

    if (!registerStoreResult) {
      return logWarn();
    }

    // If the connection returns a thenable, attach both success and failure
    // handlers so a rejection surfaces through Meteor._debug instead of
    // becoming an unhandled promise rejection that could crash the process
    // under --unhandled-rejections=strict.
    if (typeof registerStoreResult.then === 'function') {
      return registerStoreResult.then(
        ok => { if (!ok) logWarn(); },
        err => {
          if (typeof Meteor !== 'undefined' && Meteor._debug) {
            Meteor._debug(`AFS replication setup failed for "${name}":`, err);
          }
        }
      );
    }
    return registerStoreResult;
  }

  /**
   * Tear down this collection instance WITHOUT deleting its data.
   *
   * Use this when a collection object is going out of scope (e.g. hot-reload,
   * test teardown) but the underlying data should remain on disk. Stops
   * active observers, unregisters from AFS, clears local-collection caches,
   * and removes EventEmitter listeners.
   *
   * If you want to ALSO delete the data, call `dropCollectionAsync()` instead
   * — it calls `destroy()` internally after dropping the storage.
   *
   * Note: `AFS.removeCollection(name)` is registry-only — it unregisters
   * a name from lookup tables but does NOT tear down an instance. Call
   * `destroy()` on the instance when you need full teardown.
   */
  destroy() {
    this._stopObserversForThisCollection();

    if (this._name && typeof AFS !== 'undefined') {
      AFS.removeCollection(this._name);
    }

    forgetLocalCollection(this._providerName, this._name);

    this.emit('destroyed', { name: this._name });
    this.removeAllListeners();
  }

  async dropCollectionAsync() {
    // Tear down active observers BEFORE dropping data — otherwise live
    // publications either see mass "removed" storms or crash when the
    // underlying storage disappears from under them. This also evicts
    // multiplexer cache entries for this collection so any later
    // subscribers don't reuse stopped streams.
    this._stopObserversForThisCollection();

    if (this._provider && this._provider.dropCollectionAsync) {
      await this._provider.dropCollectionAsync(this._name);
    } else if (this._collection.dropCollectionAsync) {
      await this._collection.dropCollectionAsync();
    } else {
      throw new Error('Can only call dropCollectionAsync on server collections');
    }

    this.emit('collection:dropped', { name: this._name });

    if (this._name && typeof AFS !== 'undefined') {
      AFS.removeCollection(this._name);
    }
    forgetLocalCollection(this._providerName, this._name);

    this.removeAllListeners();
  }

  /**
   * Stop all multiplexers that belong to this collection. Prefers the
   * provider's public `stopObserversForCollection` API; falls back to the
   * legacy inline cache iteration for providers that have not updated.
   * @private
   */
  _stopObserversForThisCollection() {
    if (!this._name || !this._provider) return;
    if (typeof this._provider.stopObserversForCollection === 'function') {
      this._provider.stopObserversForCollection(this._name);
      return;
    }
    // Legacy fallback: reach into the cache directly. Providers extending
    // StreamProvider should inherit stopObserversForCollection and never
    // take this path.
    const cache = this._provider._multiplexerCache;
    if (!cache) return;
    const stale = [];
    for (const [key, multiplexer] of cache) {
      const desc = multiplexer.cursorDescription;
      if (desc && desc.collectionName === this._name) {
        stale.push([key, multiplexer]);
      }
    }
    for (const [, multiplexer] of stale) {
      try { multiplexer.stop(); } catch (_e) { /* best-effort */ }
    }
    for (const [key] of stale) {
      cache.delete(key);
    }
  }

  // ---------------------------------------------------------------------------
  // Count methods
  // ---------------------------------------------------------------------------

  async countDocuments(selector = {}, options = {}) {
    if (this._provider && this._provider.countAsync) {
      return this._provider.countAsync(this._name, selector, options);
    }
    if (this._collection.find) {
      return this._collection.find(selector, options).count();
    }
    throw new Error(
      `countDocuments is not available on collection "${this._name}"`
    );
  }

  async estimatedDocumentCount(options = {}) {
    return this.countDocuments({}, options);
  }
}

// Mix in allow/deny methods from the allow-deny package.
// Explicit copy with collision detection so a future method rename on either
// side does not silently clobber behavior here.
// FederatedCollection extends EventEmitter so its prototype chain already
// provides on/once/emit/removeListener without the copy step that used to
// live here.
const _AllowDenyMethods = [
  'allow',
  'deny',
  '_defineMutationMethods',
  '_updateFetch',
  '_isInsecure',
  '_validatedInsertAsync',
  '_validatedUpdateAsync',
  '_validatedRemoveAsync',
  '_callMutatorMethodAsync',
  '_callMutatorMethod',
];
for (const methodName of _AllowDenyMethods) {
  const impl = AllowDeny.CollectionPrototype[methodName];
  if (typeof impl !== 'function') {
    throw new Error(
      `AFS: AllowDeny.CollectionPrototype.${methodName} is missing; ` +
      `allow-deny package is incompatible with this version of afs.`
    );
  }
  if (Object.prototype.hasOwnProperty.call(FederatedCollection.prototype, methodName)) {
    throw new Error(
      `AFS: refusing to overwrite FederatedCollection.prototype.${methodName} ` +
      `with allow-deny mixin (would hide existing implementation).`
    );
  }
  FederatedCollection.prototype[methodName] = impl;
}

installStatics(FederatedCollection);
