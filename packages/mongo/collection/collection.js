import { normalizeProjection } from "../mongo_utils";
import { AsyncMethods } from './methods_async';
import { SyncMethods } from './methods_sync';
import { IndexMethods } from './methods_index';
import {
  ID_GENERATORS, normalizeOptions,
  setupAutopublish,
  setupConnection,
  setupDriver,
  setupMutationMethods,
  validateCollectionName
} from './collection_utils';

import { ReplicationMethods } from './methods_replication';

/**
 * @summary Namespace for MongoDB-related items
 * @namespace
 */
Mongo = {};

/**
 * @summary Constructor for a Collection
 * @locus Anywhere
 * @instancename collection
 * @class
 * @param {String} name The name of the collection.  If null, creates an unmanaged (unsynchronized) local collection.
 * @param {Object} [options]
 * @param {Object} options.connection The server connection that will manage this collection. Uses the default connection if not specified.  Pass the return value of calling [`DDP.connect`](#DDP-connect) to specify a different server. Pass `null` to specify no connection. Unmanaged (`name` is null) collections cannot specify a connection.
 * @param {String} options.idGeneration The method of generating the `_id` fields of new documents in this collection.  Possible values:

 - **`'STRING'`**: random strings
 - **`'MONGO'`**:  random [`Mongo.ObjectID`](#mongo_object_id) values

The default id generation technique is `'STRING'`.
 * @param {Function} options.transform An optional transformation function. Documents will be passed through this function before being returned from `fetch` or `findOneAsync`, and before being passed to callbacks of `observe`, `map`, `forEach`, `allow`, and `deny`. Transforms are *not* applied for the callbacks of `observeChanges` or to cursors returned from publish functions.
 * @param {Boolean} options.defineMutationMethods Set to `false` to skip setting up the mutation methods that enable insert/update/remove from client code. Default `true`.
 */
// Main Collection constructor
Mongo.Collection = function Collection(name, options) {
  name = validateCollectionName(name);

  options = normalizeOptions(options);

  this._makeNewID = ID_GENERATORS[options.idGeneration]?.(name);

  this._transform = LocalCollection.wrapTransform(options.transform);
  this.resolverType = options.resolverType;

  this._connection = setupConnection(name, options);

  const driver = setupDriver(name, this._connection, options);
  this._driver = driver;

  this._collection = driver.open(name, this._connection);
  this._name = name;

  this._settingUpReplicationPromise = this._maybeSetUpReplication(name, options);

  setupMutationMethods(this, name, options);

  setupAutopublish(this, name, options);

  Mongo._collections.set(name, this);
};

Object.assign(Mongo.Collection.prototype, {
  _getFindSelector(args) {
    if (args.length == 0) return {};
    else return args[0];
  },

  _getFindOptions(args) {
    const [, options] = args || [];
    const newOptions = normalizeProjection(options);

    var self = this;
    if (args.length < 2) {
      return { transform: self._transform };
    } else {
      check(
        newOptions,
        Match.Optional(
          Match.ObjectIncluding({
            projection: Match.Optional(Match.OneOf(Object, undefined)),
            sort: Match.Optional(
              Match.OneOf(Object, Array, Function, undefined)
            ),
            limit: Match.Optional(Match.OneOf(Number, undefined)),
            skip: Match.Optional(Match.OneOf(Number, undefined)),
          })
        )
      );

      return {
        transform: self._transform,
        ...newOptions,
      };
    }
  },
});

Object.assign(Mongo.Collection, {
  async _publishCursor(cursor, sub, collection) {
    var observeHandle = await cursor.observeChanges(
        {
          added: function(id, fields) {
            sub.added(collection, id, fields);
          },
          changed: function(id, fields) {
            sub.changed(collection, id, fields);
          },
          removed: function(id) {
            sub.removed(collection, id);
          },
        },
        // Publications don't mutate the documents
        // This is tested by the `livedata - publish callbacks clone` test
        { nonMutatingCallbacks: true }
    );

    // We don't call sub.ready() here: it gets called in livedata_server, after
    // possibly calling _publishCursor on multiple returned cursors.

    // register stop callback (expects lambda w/ no args).
    sub.onStop(async function() {
      return await observeHandle.stop();
    });

    // return the observeHandle in case it needs to be stopped early
    return observeHandle;
  },

  // protect against dangerous selectors.  falsey and {_id: falsey} are both
  // likely programmer error, and not what you want, particularly for destructive
  // operations. If a falsey _id is sent in, a new string _id will be
  // generated and returned; if a fallbackId is provided, it will be returned
  // instead.
  _rewriteSelector(selector, { fallbackId } = {}) {
    // shorthand -- scalars match _id
    if (LocalCollection._selectorIsId(selector)) selector = { _id: selector };

    if (Array.isArray(selector)) {
      // This is consistent with the Mongo console itself; if we don't do this
      // check passing an empty array ends up selecting all items
      throw new Error("Mongo selector can't be an array.");
    }

    if (!selector || ('_id' in selector && !selector._id)) {
      // can't match anything
      return { _id: fallbackId || Random.id() };
    }

    return selector;
  },
});

Object.assign(Mongo.Collection.prototype, ReplicationMethods, SyncMethods, AsyncMethods, IndexMethods);

Object.assign(Mongo.Collection.prototype, {
  // Determine if this collection is simply a minimongo representation of a real
  // database on another server
  _isRemoteCollection() {
    // XXX see #MeteorServerNull
    return this._connection && this._connection !== Meteor.server;
  },

  async dropCollectionAsync() {
    var self = this;
    if (!self._collection.dropCollectionAsync)
      throw new Error('Can only call dropCollectionAsync on server collections');
   await self._collection.dropCollectionAsync();
  },

  async createCappedCollectionAsync(byteSize, maxDocuments) {
    var self = this;
    if (! await self._collection.createCappedCollectionAsync)
      throw new Error(
        'Can only call createCappedCollectionAsync on server collections'
      );
    await self._collection.createCappedCollectionAsync(byteSize, maxDocuments);
  },

  /**
   * @summary Returns the [`Collection`](http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html) object corresponding to this collection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
   * @locus Server
   * @memberof Mongo.Collection
   * @instance
   */
  rawCollection() {
    var self = this;
    if (!self._collection.rawCollection) {
      throw new Error('Can only call rawCollection on server collections');
    }
    return self._collection.rawCollection();
  },

  /**
   * @summary Returns the [`Db`](http://mongodb.github.io/node-mongodb-native/3.0/api/Db.html) object corresponding to this collection's database connection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
   * @locus Server
   * @memberof Mongo.Collection
   * @instance
   */
  rawDatabase() {
    var self = this;
    if (!(self._driver.mongo && self._driver.mongo.db)) {
      throw new Error('Can only call rawDatabase on server collections');
    }
    return self._driver.mongo.db;
  },
});

Object.assign(Mongo, {
  /**
   * @summary Retrieve a Meteor collection instance by name. Only collections defined with [`new Mongo.Collection(...)`](#collections) are available with this method. For plain MongoDB collections, you'll want to look at [`rawDatabase()`](#Mongo-Collection-rawDatabase).
   * @locus Anywhere
   * @memberof Mongo
   * @static
   * @param {string} name Name of your collection as it was defined with `new Mongo.Collection()`.
   * @returns {Mongo.Collection | undefined}
   */
  getCollection(name) {
    return this._collections.get(name);
  },

  /**
   * @summary A record of all defined Mongo.Collection instances, indexed by collection name.
   * @type {Map<string, Mongo.Collection>}
   * @memberof Mongo
   * @protected
   */
  _collections: new Map(),
})



/**
 * @summary Create a Mongo-style `ObjectID`.  If you don't specify a `hexString`, the `ObjectID` will be generated randomly (not using MongoDB's ID construction rules).
 * @locus Anywhere
 * @class
 * @param {String} [hexString] Optional.  The 24-character hexadecimal contents of the ObjectID to create
 */
Mongo.ObjectID = MongoID.ObjectID;

/**
 * @summary To create a cursor, use find. To access the documents in a cursor, use forEach, map, or fetch.
 * @class
 * @instanceName cursor
 */
Mongo.Cursor = LocalCollection.Cursor;

/**
 * @deprecated in 0.9.1
 */
Mongo.Collection.Cursor = Mongo.Cursor;

/**
 * @deprecated in 0.9.1
 */
Mongo.Collection.ObjectID = Mongo.ObjectID;

/**
 * @deprecated in 0.9.1
 */
Meteor.Collection = Mongo.Collection;


// Allow deny stuff is now in the allow-deny package
Object.assign(Mongo.Collection.prototype, AllowDeny.CollectionPrototype);

Object.assign(Mongo.Collection.prototype, {
  /**
   * @summary Watch for changes in the collection using MongoDB change streams
   * @locus Server
   * @memberof Mongo.Collection
   * @instance
   * @param {String} eventName The name of the Meteor method to create for watching changes
   * @param {Object} [options] Options for the change stream
   * @param {Array} [options.pipeline] Pipeline for the change stream
   * @param {String} [options.fullDocument='updateLookup'] Full document option
   */
  watch(eventName, options = {}) {
    const changeStream = this.rawCollection().watch(options.pipeline || [], {
      fullDocument: options.fullDocument || 'updateLookup',
    });

    Meteor.methods({
      [eventName]: async function () {
        return new Promise((resolve) => {
          changeStream.on('change', (change) => resolve(change));
        });
      },
    });
  }
});

/**
 * MongoDB change stream watcher for Meteor applications.
 * @namespace Mongo.watcher
 *
 * @example
 * // Example usage:
 * import { LinkCollection, PostCollection } from '/imports/api/links';
 *
 * // Register collections to watch
 * Mongo.watcher
 *   .addCollection(LinkCollection, {
 *     pipeline: [
 *       { $match: { operationType: { $in: ["update", "insert", "delete"] } } },
 *     ],
 *     fullDocument: "updateLookup",
 *   })
 *   .addCollection(PostCollection, {
 *     pipeline: [
 *       { $match: { operationType: { $in: ["update", "insert", "delete"] } } },
 *     ],
 *     fullDocument: "updateLookup",
 *   })
 *   // Start watching and expose a Meteor method 'changeStream::links'
 *   .start('changeStream::links');
 *
 * // On the client, you can call the Meteor method to receive the next change event:
 * Meteor.call('changeStream::links', (err, change) => {
 *   if (!err) {
 *     console.log('Change event:', change);
 *   }
 * });
 */
if (!Mongo.watcher) {
  Mongo.watcher = {
    _collections: new Map(),
    _options: new Map(),
    _changeStreams: new Map(),

    /**
     * Registers a MongoDB collection for change stream monitoring.
     * @param {Mongo.Collection} collection - The MongoDB collection to watch.
     * @param {Object} [options={ pipeline: [], fullDocument: 'updateLookup' }] - Change stream options.
     * @param {Array} [options.pipeline=[]] - MongoDB aggregation pipeline stages.
     * @param {string} [options.fullDocument='updateLookup'] - Full document retrieval option ('default', 'updateLookup', 'whenAvailable').
     * @returns {Mongo.watcher} Instance for method chaining.
     * @throws {Error} If collection is not a valid Mongo.Collection instance.
     */
    addCollection(collection, options = { pipeline: [], fullDocument: 'updateLookup' }) {
      if (!(collection instanceof Mongo.Collection)) {
        throw new Error('Invalid collection: must be a Mongo.Collection instance');
      }
      this._collections.set(collection._name, collection);
      this._options.set(collection._name, { ...options, pipeline: Array.isArray(options.pipeline) ? options.pipeline : [] });
      return this;
    },

    /**
     * Initiates change stream monitoring for all registered collections and exposes a Meteor method.
     * @param {string} eventName - Unique name for the Meteor method to expose change events.
     * @param {Object} [globalOptions={}] - Global change stream configuration.
     * @param {Array} [globalOptions.pipeline=[]] - Additional pipeline stages for the change stream.
     * @param {string} [globalOptions.fullDocument='updateLookup'] - Full document retrieval option.
     * @returns {Mongo.watcher} Instance for method chaining.
     * @throws {Error} If no collections are registered or eventName is invalid.
     */
    start(eventName, globalOptions = {}) {
      if (typeof eventName !== 'string' || !eventName.trim()) {
        throw new Error('Invalid eventName: must be a non-empty string');
      }

      if (this._changeStreams.has(eventName)) {
        this.stop(eventName);
      }

      const collectionNames = Array.from(this._collections.keys());
      if (!collectionNames.length) {
        throw new Error('No collections registered to watch');
      }

      const pipelines = [{
        $match: { 'ns.coll': { $in: collectionNames } }
      }];

      if (Array.isArray(globalOptions.pipeline)) {
        pipelines.push(...globalOptions.pipeline);
      }

      const fullDocument = globalOptions.fullDocument || 'updateLookup';
      const db = this._collections.values().next().value.rawDatabase();
      const changeStream = db.watch(pipelines, { fullDocument });
      this._changeStreams.set(eventName, changeStream);

      Meteor.methods({
        [eventName]: async () => {
          try {
            return await new Promise((resolve, reject) => {
              const onChange = change => {
                changeStream.removeListener('change', onChange);
                resolve(change);
              };
              changeStream.once('change', onChange);
              changeStream.once('error', err => {
                changeStream.removeListener('change', onChange);
                reject(err);
              });
            });
          } catch (err) {
            throw new Meteor.Error('change-stream-error', err.message);
          }
        }
      });

      return this;
    },

    /**
     * Terminates change stream monitoring for the specified event and cleans up resources.
     * @param {string} eventName - The Meteor method name to stop.
     * @returns {Mongo.watcher} Instance for method chaining.
     */
    stop(eventName) {
      if (typeof eventName !== 'string' || !eventName.trim()) {
        throw new Error('Invalid eventName: must be a non-empty string');
      }

      const changeStream = this._changeStreams.get(eventName);
      if (changeStream) {
        changeStream.close().catch(() => {});
        this._changeStreams.delete(eventName);
      }

      return this;
    }
  };
}