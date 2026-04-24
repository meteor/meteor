import { AFSCursor } from './cursor';
import { EventEmitter } from 'events';

// Lightweight local collection driver for AFS.
// Replicates the same pattern as mongo/local_collection_driver.js
// without depending on the mongo package.
//
// Keys are namespaced by provider so two collections with the same name but
// different server-side providers cannot share client-side Minimongo state.
const _afsLocalCollections = Object.create(null);

function _localKey(providerName, name) {
  return `${providerName || 'default'}:${name}`;
}

function openLocalCollection(providerName, name, conn) {
  if (!name) {
    return new LocalCollection();
  }

  const key = _localKey(providerName, name);

  if (!conn) {
    if (!(key in _afsLocalCollections)) {
      _afsLocalCollections[key] = new LocalCollection(name);
    }
    return _afsLocalCollections[key];
  }

  if (!conn._afs_collections) {
    conn._afs_collections = Object.create(null);
  }

  if (!(key in conn._afs_collections)) {
    conn._afs_collections[key] = new LocalCollection(name);
  }
  return conn._afs_collections[key];
}

// ---------------------------------------------------------------------------
// Collection Extensions API (matches Mongo.Collection extension pattern)
// ---------------------------------------------------------------------------

const _CollectionExtensions = {
  _extensions: [],
  _prototypeMethods: new Map(),
  _staticMethods: new Map(),

  addExtension(ext) { this._extensions.push(ext); },
  removeExtension(ext) { this._extensions = this._extensions.filter(e => e !== ext); },
  addPrototypeMethod(name, method) { this._prototypeMethods.set(name, method); },
  removePrototypeMethod(name) { this._prototypeMethods.delete(name); },
  addStaticMethod(name, method) { this._staticMethods.set(name, method); },
  removeStaticMethod(name) { this._staticMethods.delete(name); },
  clearExtensions() { this._extensions = []; this._prototypeMethods.clear(); this._staticMethods.clear(); },
  getExtensions() { return [...this._extensions]; },
  getPrototypeMethods() { return new Map(this._prototypeMethods); },
  getStaticMethods() { return new Map(this._staticMethods); },

  _applyExtensions(instance, name, options) {
    for (const ext of this._extensions) { ext.call(instance, name, options); }
    for (const [methodName, method] of this._prototypeMethods) {
      instance[methodName] = method.bind(instance);
    }
  },
};

/**
 * FederatedCollection - A collection that works with any StreamProvider.
 *
 * On the server, operations are delegated to the StreamProvider.
 * On the client, operations use Minimongo + DDP sync (identical to Mongo.Collection).
 *
 * This class implements the same interface as Mongo.Collection, so it can be
 * used interchangeably in publications, methods, templates, and application code.
 */
export class FederatedCollection {
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
    // Initialize EventEmitter
    EventEmitter.call(this);
    this.setMaxListeners(0);

    // Validate name
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

    // ID generation
    const idGeneration = options.idGeneration || 'STRING';
    this._makeNewID = this._createIdGenerator(name, idGeneration);

    // Set up connection (client or server)
    this._connection = this._setupConnection(name, options);

    // Set up the underlying collection storage
    this._setupStorage(name, options);

    // Set up DDP replication (client-server sync)
    this._settingUpReplicationPromise = this._maybeSetUpReplication(name, options);

    // Set up mutation methods (allow/deny, DDP methods)
    if (options.defineMutationMethods !== false) {
      this._setupMutationMethods(name, options);
    }

    // Auto-publish if autopublish package is loaded
    this._setupAutopublish(name, options);

    // Register with AFS registry
    if (name && typeof AFS !== 'undefined') {
      AFS.registerCollection(name, this);
    }

    // Apply collection extensions
    _CollectionExtensions._applyExtensions(this, name, options);
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
    // Normalize arguments (same pattern as Mongo.Collection)
    if (arguments.length === 0) {
      selector = {};
    }

    options = this._getFindOptions(options);

    if (Meteor.isServer && this._provider) {
      // Record access pattern for adaptive engine
      if (typeof AFS !== 'undefined' && AFS._engine) {
        AFS._engine.recordAccess(this._name, selector, options);
      }

      // Server with provider: use AFSCursor backed by StreamProvider
      return new AFSCursor(
        this._provider,
        this._name,
        this._rewriteSelector(selector),
        options
      );
    }

    // Client or local-only: use LocalCollection
    return this._collection.find(
      this._rewriteSelector(selector),
      options
    );
  }

  /**
   * Find a single document (async).
   * @param {Object} [selector]
   * @param {Object} [options]
   * @returns {Promise<Object|undefined>}
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

  /**
   * Insert a document.
   * @param {Object} doc
   * @returns {Promise<string>} The _id of the inserted document
   */
  async insertAsync(doc) {
    if (!doc) {
      throw new Error('insertAsync requires a document argument');
    }

    doc = EJSON.clone(doc);

    if (!doc._id) {
      doc._id = this._makeNewID();
    }

    if (this._isRemoteCollection()) {
      return this._callMutatorMethodAsync('insertAsync', [doc]);
    }

    if (this._provider && Meteor.isServer) {
      this.emit('before:insert', { doc });
      const id = await this._provider.insertAsync(this._name, doc);
      this.emit('after:insert', { doc, id });
      if (typeof AFS !== 'undefined' && AFS._engine) AFS._engine._metrics.totalWrites++;
      return id;
    }

    return this._collection.insertAsync(doc);
  }

  /**
   * Update documents matching selector.
   * @param {Object} selector
   * @param {Object} modifier
   * @param {Object} [options]
   * @returns {Promise<number>}
   */
  async updateAsync(selector, modifier, options = {}) {
    selector = this._rewriteSelector(selector);

    if (this._isRemoteCollection()) {
      return this._callMutatorMethodAsync('updateAsync', [selector, modifier, options]);
    }

    if (this._provider && Meteor.isServer) {
      this.emit('before:update', { selector, modifier, options });
      const result = await this._provider.updateAsync(this._name, selector, modifier, options);
      this.emit('after:update', { selector, modifier, options, result });
      if (typeof AFS !== 'undefined' && AFS._engine) AFS._engine._metrics.totalWrites++;
      return result;
    }

    return this._collection.updateAsync(selector, modifier, options);
  }

  /**
   * Remove documents matching selector.
   * @param {Object} selector
   * @returns {Promise<number>}
   */
  async removeAsync(selector) {
    selector = this._rewriteSelector(selector);

    if (this._isRemoteCollection()) {
      return this._callMutatorMethodAsync('removeAsync', [selector]);
    }

    if (this._provider && Meteor.isServer) {
      this.emit('before:remove', { selector });
      const result = await this._provider.removeAsync(this._name, selector);
      this.emit('after:remove', { selector, result });
      if (typeof AFS !== 'undefined' && AFS._engine) AFS._engine._metrics.totalWrites++;
      return result;
    }

    return this._collection.removeAsync(selector);
  }

  /**
   * Upsert: update or insert.
   * @param {Object} selector
   * @param {Object} modifier
   * @param {Object} [options]
   * @returns {Promise<{numberAffected: number, insertedId?: string}>}
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

  /**
   * Get the raw database client from the provider.
   * @returns {Object}
   */
  rawDatabase() {
    if (this._provider) {
      return this._provider.rawDatabase();
    }
    throw new Error('rawDatabase is only available on server collections with a provider');
  }

  /**
   * Get the raw collection/table handle.
   * @returns {Object}
   */
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

  _getCollectionName() {
    return this._name;
  }

  // ---------------------------------------------------------------------------
  // Private: Setup methods
  // ---------------------------------------------------------------------------

  _createIdGenerator(name, idGeneration) {
    if (idGeneration === 'UUID') {
      if (Meteor.isServer) {
        // Lazy require keeps this out of the client bundle.
        const { randomUUID } = require('crypto');
        return function () {
          return randomUUID();
        };
      }
      // Client fallback: use Random.hexString for UUID-like IDs
      return function () {
        const hex = Random.hexString(32);
        return [hex.slice(0,8), hex.slice(8,12), '4' + hex.slice(13,16),
                ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17,20),
                hex.slice(20,32)].join('-');
      };
    }
    // Default: STRING
    return function () {
      const src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
      return src.id();
    };
  }

  _setupConnection(name, options) {
    if (!name || options.connection === null) return null;
    if (options.connection) return options.connection;
    return Meteor.isClient ? Meteor.connection : Meteor.server;
  }

  _setupStorage(name, options) {
    if (Meteor.isServer && this._provider) {
      // Server with provider: create a "collection adapter" that wraps
      // the StreamProvider to look like a LocalCollection for allow/deny
      this._collection = this._createProviderAdapter();
    } else {
      // Client or no provider: use LocalCollection directly
      // This mirrors what mongo/local_collection_driver.js does
      this._collection = openLocalCollection(
        this._providerName,
        name,
        this._connection
      );
    }
  }

  /**
   * Create an adapter object that wraps the StreamProvider to look like
   * a LocalCollection. This is needed for compatibility with allow/deny
   * and the replication store system.
   * @private
   */
  _createProviderAdapter() {
    const provider = this._provider;
    const collectionName = this._name;
    const self = this;

    return {
      async findOneAsync(selector, options) {
        return provider.findOneAsync(collectionName, selector, options);
      },

      find(selector, options) {
        return provider.find(collectionName, selector, options);
      },

      async insertAsync(doc) {
        self.emit('before:insert', { doc });
        const id = await provider.insertAsync(collectionName, doc);
        self.emit('after:insert', { doc, id });
        if (typeof AFS !== 'undefined' && AFS._engine) AFS._engine._metrics.totalWrites++;
        return id;
      },

      async updateAsync(selector, modifier, options) {
        self.emit('before:update', { selector, modifier, options });
        const result = await provider.updateAsync(collectionName, selector, modifier, options);
        self.emit('after:update', { selector, modifier, options, result });
        if (typeof AFS !== 'undefined' && AFS._engine) AFS._engine._metrics.totalWrites++;
        return result;
      },

      async removeAsync(selector) {
        self.emit('before:remove', { selector });
        const result = await provider.removeAsync(collectionName, selector);
        self.emit('after:remove', { selector, result });
        if (typeof AFS !== 'undefined' && AFS._engine) AFS._engine._metrics.totalWrites++;
        return result;
      },

      // Count support
      async countDocuments(selector, options) {
        return provider.countAsync(collectionName, selector, options);
      },

      async estimatedDocumentCount(options) {
        return provider.countAsync(collectionName, {}, options);
      },

      // Required for DDP replication store
      saveOriginals() {},
      retrieveOriginals() { return null; },

      // Pause/resume (no-op on server with provider; observers are handled by provider)
      pauseObservers() {},
      resumeObserversClient() {},
      async resumeObserversServer() {},

      // Document access for replication
      _docs: {
        async get(id) {
          return provider.findOneAsync(collectionName, { _id: id });
        },
      },
    };
  }

  _setupMutationMethods(name, options) {
    // Use allow-deny's _defineMutationMethods if available
    if (typeof this._defineMutationMethods === 'function') {
      try {
        this._defineMutationMethods({
          useExisting: options._suppressSameNameError === true,
        });
      } catch (error) {
        if (error.message === `A method named '/${name}/insertAsync' is already defined`) {
          throw new Error(`There is already a collection named "${name}"`);
        }
        throw error;
      }
    }
  }

  _setupAutopublish(name, options) {
    if (
      Package.autopublish &&
      !options._preventAutopublish &&
      this._connection &&
      this._connection.publish
    ) {
      this._connection.publish(null, () => this.find(), {
        is_auto: true,
      });
    }
  }

  _rewriteSelector(selector, { fallbackId } = {}) {
    // Shorthand: scalars match _id
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

    // Normalize 'fields' to 'projection'
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
    const self = this;
    if (
      !(
        self._connection &&
        self._connection.registerStoreClient &&
        self._connection.registerStoreServer
      )
    ) {
      return;
    }

    const wrappedStoreCommon = {
      saveOriginals() {
        self._collection.saveOriginals();
      },
      retrieveOriginals() {
        return self._collection.retrieveOriginals();
      },
      _getCollection() {
        return self;
      },
    };

    const wrappedStoreClient = {
      async beginUpdate(batchSize, reset) {
        if (batchSize > 1 || reset) self._collection.pauseObservers();
        if (reset) await self._collection.remove({});
        self.emit('replication:batch-started', { batchSize, reset });
      },

      update(msg) {
        const mongoId = MongoID.idParse(msg.id);
        const doc = self._collection._docs.get(mongoId);

        // Handle mergebox-disabled gracefully
        if (Meteor.isClient) {
          if (msg.msg === 'added' && doc) {
            msg.msg = 'changed';
          } else if (msg.msg === 'removed' && !doc) {
            return;
          } else if (msg.msg === 'changed' && !doc) {
            msg.msg = 'added';
            const _ref = msg.fields;
            for (let field in _ref) {
              const value = _ref[field];
              if (value === void 0) {
                delete msg.fields[field];
              }
            }
          }
        }

        if (msg.msg === 'replace') {
          const replace = msg.replace;
          if (!replace) {
            if (doc) self._collection.remove(mongoId);
          } else if (!doc) {
            self._collection.insert(replace);
          } else {
            self._collection.update(mongoId, replace);
          }
        } else if (msg.msg === 'added') {
          if (doc) {
            throw new Error('Expected not to find a document already present for an add');
          }
          self._collection.insert({ _id: mongoId, ...msg.fields });
        } else if (msg.msg === 'removed') {
          if (!doc) {
            throw new Error('Expected to find a document already present for removed');
          }
          self._collection.remove(mongoId);
        } else if (msg.msg === 'changed') {
          if (!doc) throw new Error('Expected to find a document to change');
          const keys = Object.keys(msg.fields);
          if (keys.length > 0) {
            const modifier = {};
            keys.forEach(key => {
              const value = msg.fields[key];
              if (EJSON.equals(doc[key], value)) return;
              if (typeof value === 'undefined') {
                if (!modifier.$unset) modifier.$unset = {};
                modifier.$unset[key] = 1;
              } else {
                if (!modifier.$set) modifier.$set = {};
                modifier.$set[key] = value;
              }
            });
            if (Object.keys(modifier).length > 0) {
              self._collection.update(mongoId, modifier);
            }
          }
        } else {
          throw new Error("I don't know how to deal with this message");
        }

        self.emit('replication:update', { msg: msg.msg, id: msg.id });
      },

      endUpdate() {
        self._collection.resumeObserversClient();
        self.emit('replication:batch-ended');
      },

      async getDoc(id) {
        return self.findOneAsync(id);
      },

      ...wrappedStoreCommon,
    };

    const wrappedStoreServer = {
      async beginUpdate(batchSize, reset) {
        if (batchSize > 1 || reset) self._collection.pauseObservers();
        if (reset) await self._collection.removeAsync({});
        self.emit('replication:batch-started', { batchSize, reset });
      },

      async update(msg) {
        const mongoId = MongoID.idParse(msg.id);
        // On the server-with-provider path, _docs.get returns a Promise
        // that resolves to the current doc; on LocalCollection it returns
        // the doc synchronously. `await` handles both.
        const doc = await self._collection._docs.get(mongoId);

        if (msg.msg === 'replace') {
          const replace = msg.replace;
          if (!replace) {
            if (doc) await self._collection.removeAsync(mongoId);
          } else if (!doc) {
            await self._collection.insertAsync(replace);
          } else {
            await self._collection.updateAsync(mongoId, replace);
          }
        } else if (msg.msg === 'added') {
          if (doc) {
            throw new Error('Expected not to find a document already present for an add');
          }
          await self._collection.insertAsync({ _id: mongoId, ...msg.fields });
        } else if (msg.msg === 'removed') {
          if (!doc) {
            throw new Error('Expected to find a document already present for removed');
          }
          await self._collection.removeAsync(mongoId);
        } else if (msg.msg === 'changed') {
          if (!doc) throw new Error('Expected to find a document to change');
          const keys = Object.keys(msg.fields);
          if (keys.length > 0) {
            const modifier = {};
            keys.forEach(key => {
              const value = msg.fields[key];
              if (EJSON.equals(doc[key], value)) return;
              if (typeof value === 'undefined') {
                if (!modifier.$unset) modifier.$unset = {};
                modifier.$unset[key] = 1;
              } else {
                if (!modifier.$set) modifier.$set = {};
                modifier.$set[key] = value;
              }
            });
            if (Object.keys(modifier).length > 0) {
              await self._collection.updateAsync(mongoId, modifier);
            }
          }
        } else {
          throw new Error("I don't know how to deal with this message");
        }

        self.emit('replication:update', { msg: msg.msg, id: msg.id });
      },

      async endUpdate() {
        await self._collection.resumeObserversServer();
        self.emit('replication:batch-ended');
      },

      async getDoc(id) {
        return self.findOneAsync(id);
      },

      ...wrappedStoreCommon,
    };

    let registerStoreResult;
    if (Meteor.isClient) {
      registerStoreResult = self._connection.registerStoreClient(
        name,
        wrappedStoreClient
      );
    } else {
      registerStoreResult = self._connection.registerStoreServer(
        name,
        wrappedStoreServer
      );
    }

    const message = `There is already a collection named "${name}"`;
    const logWarn = () => {
      console.warn ? console.warn(message) : console.log(message);
    };

    if (!registerStoreResult) {
      return logWarn();
    }

    return registerStoreResult?.then?.(ok => {
      if (!ok) {
        logWarn();
      }
    });
  }

  async dropCollectionAsync() {
    if (this._provider && this._provider.dropCollectionAsync) {
      await this._provider.dropCollectionAsync(this._name);
    } else if (this._collection.dropCollectionAsync) {
      await this._collection.dropCollectionAsync();
    } else {
      throw new Error('Can only call dropCollectionAsync on server collections');
    }

    // Clean up registry
    if (this._name && typeof AFS !== 'undefined') {
      AFS.removeCollection(this._name);
    }

    // Clean up local collection cache
    if (this._name) {
      const key = _localKey(this._providerName, this._name);
      if (_afsLocalCollections[key]) {
        delete _afsLocalCollections[key];
      }
    }

    // Remove all EventEmitter listeners
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Count methods
  // ---------------------------------------------------------------------------

  /**
   * Count documents matching a selector.
   * @param {Object} [selector={}]
   * @param {Object} [options]
   * @returns {Promise<number>}
   */
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

  /**
   * Estimated document count (no filter, fast path).
   * @param {Object} [options]
   * @returns {Promise<number>}
   */
  async estimatedDocumentCount(options = {}) {
    return this.countDocuments({}, options);
  }
}

// Mix in EventEmitter methods (on, once, emit, removeListener, etc.)
// Applied first so AllowDeny wins on any property conflicts.
Object.getOwnPropertyNames(EventEmitter.prototype).forEach(key => {
  if (key !== 'constructor') {
    FederatedCollection.prototype[key] = EventEmitter.prototype[key];
  }
});

// Mix in allow/deny methods from the allow-deny package.
// Explicit copy with collision detection so a future method rename on either
// side does not silently clobber behavior here.
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

// Collection Extensions static API
FederatedCollection.addExtension = (ext) => _CollectionExtensions.addExtension(ext);
FederatedCollection.removeExtension = (ext) => _CollectionExtensions.removeExtension(ext);
FederatedCollection.addPrototypeMethod = (name, method) => _CollectionExtensions.addPrototypeMethod(name, method);
FederatedCollection.removePrototypeMethod = (name) => _CollectionExtensions.removePrototypeMethod(name);
FederatedCollection.addStaticMethod = (name, method) => {
  _CollectionExtensions.addStaticMethod(name, method);
  FederatedCollection[name] = method;
};
FederatedCollection.removeStaticMethod = (name) => {
  _CollectionExtensions.removeStaticMethod(name);
  delete FederatedCollection[name];
};
FederatedCollection.clearExtensions = () => _CollectionExtensions.clearExtensions();
FederatedCollection.getExtensions = () => _CollectionExtensions.getExtensions();
FederatedCollection.getPrototypeMethods = () => _CollectionExtensions.getPrototypeMethods();
FederatedCollection.getStaticMethods = () => _CollectionExtensions.getStaticMethods();
