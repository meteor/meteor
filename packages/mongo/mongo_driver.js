import has from 'lodash.has';
import identity from 'lodash.identity';
import clone from 'lodash.clone';

/**
 * Provide a synchronous Collection API using fibers, backed by
 * MongoDB.  This is only for use on the server, and mostly identical
 * to the client API.
 *
 * NOTE: the public API methods must be run within a fiber. If you call
 * these outside of a fiber they will explode!
 */

const path = require("path");
const util = require("util");

/** @type {import('mongodb')} */
var MongoDB = NpmModuleMongodb;
import { DocFetcher } from "./doc_fetcher.js";
import {
  ASYNC_CURSOR_METHODS,
  CLIENT_ONLY_METHODS,
  getAsyncMethodName
} from "meteor/minimongo/constants";
import { Meteor } from "meteor/meteor";

MongoInternals = {};

MongoInternals.__packageName = 'mongo';

MongoInternals.NpmModules = {
  mongodb: {
    version: NpmModuleMongodbVersion,
    module: MongoDB
  }
};

// Older version of what is now available via
// MongoInternals.NpmModules.mongodb.module.  It was never documented, but
// people do use it.
// XXX COMPAT WITH 1.0.3.2
MongoInternals.NpmModule = MongoDB;

const FILE_ASSET_SUFFIX = 'Asset';
const ASSETS_FOLDER = 'assets';
const APP_FOLDER = 'app';

// This is used to add or remove EJSON from the beginning of everything nested
// inside an EJSON custom type. It should only be called on pure JSON!
var replaceNames = function (filter, thing) {
  if (typeof thing === "object" && thing !== null) {
    if (Array.isArray(thing)) {
      return thing.map(replaceNames.bind(null, filter));
    }
    var ret = {};
    Object.entries(thing).forEach(function ([key, value]) {
      ret[filter(key)] = replaceNames(filter, value);
    });
    return ret;
  }
  return thing;
};

// Ensure that EJSON.clone keeps a Timestamp as a Timestamp (instead of just
// doing a structural clone).
// XXX how ok is this? what if there are multiple copies of MongoDB loaded?
MongoDB.Timestamp.prototype.clone = function () {
  // Timestamps should be immutable.
  return this;
};

var makeMongoLegal = function (name) { return "EJSON" + name; };
var unmakeMongoLegal = function (name) { return name.substr(5); };

var replaceMongoAtomWithMeteor = function (document) {
  if (document instanceof MongoDB.Binary) {
    // for backwards compatibility
    if (document.sub_type !== 0) {
      return document;
    }
    var buffer = document.value(true);
    return new Uint8Array(buffer);
  }
  if (document instanceof MongoDB.ObjectID) {
    return new Mongo.ObjectID(document.toHexString());
  }
  if (document instanceof MongoDB.Decimal128) {
    return Decimal(document.toString());
  }
  if (document["EJSON$type"] && document["EJSON$value"] && Object.keys(document).length === 2) {
    return EJSON.fromJSONValue(replaceNames(unmakeMongoLegal, document));
  }
  if (document instanceof MongoDB.Timestamp) {
    // For now, the Meteor representation of a Mongo timestamp type (not a date!
    // this is a weird internal thing used in the oplog!) is the same as the
    // Mongo representation. We need to do this explicitly or else we would do a
    // structural clone and lose the prototype.
    return document;
  }
  return undefined;
};

var replaceMeteorAtomWithMongo = function (document) {
  if (EJSON.isBinary(document)) {
    // This does more copies than we'd like, but is necessary because
    // MongoDB.BSON only looks like it takes a Uint8Array (and doesn't actually
    // serialize it correctly).
    return new MongoDB.Binary(Buffer.from(document));
  }
  if (document instanceof MongoDB.Binary) {
     return document;
  }
  if (document instanceof Mongo.ObjectID) {
    return new MongoDB.ObjectID(document.toHexString());
  }
  if (document instanceof MongoDB.Timestamp) {
    // For now, the Meteor representation of a Mongo timestamp type (not a date!
    // this is a weird internal thing used in the oplog!) is the same as the
    // Mongo representation. We need to do this explicitly or else we would do a
    // structural clone and lose the prototype.
    return document;
  }
  if (document instanceof Decimal) {
    return MongoDB.Decimal128.fromString(document.toString());
  }
  if (EJSON._isCustomType(document)) {
    return replaceNames(makeMongoLegal, EJSON.toJSONValue(document));
  }
  // It is not ordinarily possible to stick dollar-sign keys into mongo
  // so we don't bother checking for things that need escaping at this time.
  return undefined;
};

var replaceTypes = function (document, atomTransformer) {
  if (typeof document !== 'object' || document === null)
    return document;

  var replacedTopLevelAtom = atomTransformer(document);
  if (replacedTopLevelAtom !== undefined)
    return replacedTopLevelAtom;

  var ret = document;
  Object.entries(document).forEach(function ([key, val]) {
    var valReplaced = replaceTypes(val, atomTransformer);
    if (val !== valReplaced) {
      // Lazy clone. Shallow copy.
      if (ret === document)
        ret = clone(document);
      ret[key] = valReplaced;
    }
  });
  return ret;
};


MongoConnection = function (url, options) {
  var self = this;
  options = options || {};
  self._observeMultiplexers = {};
  self._onFailoverHook = new Hook;

  const userOptions = {
    ...(Mongo._connectionOptions || {}),
    ...(Meteor.settings?.packages?.mongo?.options || {})
  };

  var mongoOptions = Object.assign({
    ignoreUndefined: true,
  }, userOptions);



  // Internally the oplog connections specify their own maxPoolSize
  // which we don't want to overwrite with any user defined value
  if (has(options, 'maxPoolSize')) {
    // If we just set this for "server", replSet will override it. If we just
    // set it for replSet, it will be ignored if we're not using a replSet.
    mongoOptions.maxPoolSize = options.maxPoolSize;
  }
  if (has(options, 'minPoolSize')) {
    mongoOptions.minPoolSize = options.minPoolSize;
  }

  // Transform options like "tlsCAFileAsset": "filename.pem" into
  // "tlsCAFile": "/<fullpath>/filename.pem"
  Object.entries(mongoOptions || {})
    .filter(([key]) => key && key.endsWith(FILE_ASSET_SUFFIX))
    .forEach(([key, value]) => {
      const optionName = key.replace(FILE_ASSET_SUFFIX, '');
      mongoOptions[optionName] = path.join(Assets.getServerDir(),
        ASSETS_FOLDER, APP_FOLDER, value);
      delete mongoOptions[key];
    });

  self.db = null;
  self._oplogHandle = null;
  self._docFetcher = null;

  mongoOptions.driverInfo = {
    name: 'Meteor',
    version: Meteor.release
  }
  
  self.client = new MongoDB.MongoClient(url, mongoOptions);
  self.db = self.client.db();

  self.client.on('serverDescriptionChanged', Meteor.bindEnvironment(event => {
    // When the connection is no longer against the primary node, execute all
    // failover hooks. This is important for the driver as it has to re-pool the
    // query when it happens.
    if (
      event.previousDescription.type !== 'RSPrimary' &&
      event.newDescription.type === 'RSPrimary'
    ) {
      self._onFailoverHook.each(callback => {
        callback();
        return true;
      });
    }
  }));

  if (options.oplogUrl && ! Package['disable-oplog']) {
    self._oplogHandle = new OplogHandle(options.oplogUrl, self.db.databaseName);
    self._docFetcher = new DocFetcher(self);
  }

};

MongoConnection.prototype._close = async function() {
  var self = this;

  if (! self.db)
    throw Error("close called before Connection created?");

  // XXX probably untested
  var oplogHandle = self._oplogHandle;
  self._oplogHandle = null;
  if (oplogHandle)
    await oplogHandle.stop();

  // Use Future.wrap so that errors get thrown. This happens to
  // work even outside a fiber since the 'close' method is not
  // actually asynchronous.
  await self.client.close();
};

MongoConnection.prototype.close = function () {
  return this._close();
};

MongoConnection.prototype._setOplogHandle = function(oplogHandle) {
  this._oplogHandle = oplogHandle;
  return this;
};

// Returns the Mongo Collection object; may yield.
MongoConnection.prototype.rawCollection = function (collectionName) {
  var self = this;

  if (! self.db)
    throw Error("rawCollection called before Connection created?");

  return self.db.collection(collectionName);
};

MongoConnection.prototype.createCappedCollectionAsync = async function (
    collectionName, byteSize, maxDocuments) {
  var self = this;

  if (! self.db)
    throw Error("createCappedCollectionAsync called before Connection created?");


  await self.db.createCollection(collectionName,
    { capped: true, size: byteSize, max: maxDocuments });
};

// This should be called synchronously with a write, to create a
// transaction on the current write fence, if any. After we can read
// the write, and after observers have been notified (or at least,
// after the observer notifiers have added themselves to the write
// fence), you should call 'committed()' on the object returned.
MongoConnection.prototype._maybeBeginWrite = function () {
  const fence = DDPServer._getCurrentFence();
  if (fence) {
    return fence.beginWrite();
  } else {
    return {committed: function () {}};
  }
};

// Internal interface: adds a callback which is called when the Mongo primary
// changes. Returns a stop handle.
MongoConnection.prototype._onFailover = function (callback) {
  return this._onFailoverHook.register(callback);
};


//////////// Public API //////////

// The write methods block until the database has confirmed the write (it may
// not be replicated or stable on disk, but one server has confirmed it) if no
// callback is provided. If a callback is provided, then they call the callback
// when the write is confirmed. They return nothing on success, and raise an
// exception on failure.
//
// After making a write (with insert, update, remove), observers are
// notified asynchronously. If you want to receive a callback once all
// of the observer notifications have landed for your write, do the
// writes inside a write fence (set DDPServer._CurrentWriteFence to a new
// _WriteFence, and then set a callback on the write fence.)
//
// Since our execution environment is single-threaded, this is
// well-defined -- a write "has been made" if it's returned, and an
// observer "has been notified" if its callback has returned.

var writeCallback = function (write, refresh, callback) {
  return function (err, result) {
    if (! err) {
      // XXX We don't have to run this on error, right?
      try {
        refresh();
      } catch (refreshErr) {
        if (callback) {
          callback(refreshErr);
          return;
        } else {
          throw refreshErr;
        }
      }
    }
    write.committed();
    if (callback) {
      callback(err, result);
    } else if (err) {
      throw err;
    }
  };
};

var bindEnvironmentForWrite = function (callback) {
  return Meteor.bindEnvironment(callback, "Mongo write");
};

MongoConnection.prototype.insertAsync = async function (collection_name, document) {
  const self = this;

  if (collection_name === "___meteor_failure_test_collection") {
    const e = new Error("Failure test");
    e._expectedByTest = true;
    throw e;
  }

  if (!(LocalCollection._isPlainObject(document) &&
        !EJSON._isCustomType(document))) {
    throw new Error("Only plain objects may be inserted into MongoDB");
  }

  var write = self._maybeBeginWrite();
  var refresh = async function () {
    await Meteor.refresh({collection: collection_name, id: document._id });
  };
  return self.rawCollection(collection_name).insertOne(
    replaceTypes(document, replaceMeteorAtomWithMongo),
    {
      safe: true,
    }
  ).then(async ({insertedId}) => {
    await refresh();
    await write.committed();
    return insertedId;
  }).catch(async e => {
    await write.committed();
    throw e;
  });
};


// Cause queries that may be affected by the selector to poll in this write
// fence.
MongoConnection.prototype._refresh = async function (collectionName, selector) {
  var refreshKey = {collection: collectionName};
  // If we know which documents we're removing, don't poll queries that are
  // specific to other documents. (Note that multiple notifications here should
  // not cause multiple polls, since all our listener is doing is enqueueing a
  // poll.)
  var specificIds = LocalCollection._idsMatchedBySelector(selector);
  if (specificIds) {
    for (const id of specificIds) {
      await Meteor.refresh(Object.assign({id: id}, refreshKey));
    };
  } else {
    await Meteor.refresh(refreshKey);
  }
};

MongoConnection.prototype.removeAsync = async function (collection_name, selector) {
  var self = this;

  if (collection_name === "___meteor_failure_test_collection") {
    var e = new Error("Failure test");
    e._expectedByTest = true;
    throw e;
  }

  var write = self._maybeBeginWrite();
  var refresh = async function () {
    await self._refresh(collection_name, selector);
  };

  return self.rawCollection(collection_name)
    .deleteMany(replaceTypes(selector, replaceMeteorAtomWithMongo), {
      safe: true,
    })
    .then(async ({ deletedCount }) => {
      await refresh();
      await write.committed();
      return transformResult({ result : {modifiedCount : deletedCount} }).numberAffected;
    }).catch(async (err) => {
        await write.committed();
        throw err;
    });
};

MongoConnection.prototype.dropCollectionAsync = async function(collectionName) {
  var self = this;


  var write = self._maybeBeginWrite();
  var refresh = function() {
    return Meteor.refresh({
      collection: collectionName,
      id: null,
      dropCollection: true,
    });
  };

  return self
    .rawCollection(collectionName)
    .drop()
    .then(async result => {
      await refresh();
      await write.committed();
      return result;
    })
    .catch(async e => {
      await write.committed();
      throw e;
    });
};

// For testing only.  Slightly better than `c.rawDatabase().dropDatabase()`
// because it lets the test's fence wait for it to be complete.
MongoConnection.prototype.dropDatabaseAsync = async function () {
  var self = this;

  var write = self._maybeBeginWrite();
  var refresh = async function () {
    await Meteor.refresh({ dropDatabase: true });
  };

  try {
    await self.db._dropDatabase();
    await refresh();
    await write.committed();
  } catch (e) {
    await write.committed();
    throw e;
  }
};

MongoConnection.prototype.updateAsync = async function (collection_name, selector, mod, options) {
  var self = this;

  if (collection_name === "___meteor_failure_test_collection") {
    var e = new Error("Failure test");
    e._expectedByTest = true;
    throw e;
  }

  // explicit safety check. null and undefined can crash the mongo
  // driver. Although the node driver and minimongo do 'support'
  // non-object modifier in that they don't crash, they are not
  // meaningful operations and do not do anything. Defensively throw an
  // error here.
  if (!mod || typeof mod !== 'object') {
    const error = new Error("Invalid modifier. Modifier must be an object.");

    throw error;
  }

  if (!(LocalCollection._isPlainObject(mod) && !EJSON._isCustomType(mod))) {
    const error = new Error(
        "Only plain objects may be used as replacement" +
        " documents in MongoDB");

    throw error;
  }

  if (!options) options = {};

  var write = self._maybeBeginWrite();
  var refresh = async function () {
    await self._refresh(collection_name, selector);
  };

  var collection = self.rawCollection(collection_name);
  var mongoOpts = {safe: true};
  // Add support for filtered positional operator
  if (options.arrayFilters !== undefined) mongoOpts.arrayFilters = options.arrayFilters;
  // explictly enumerate options that minimongo supports
  if (options.upsert) mongoOpts.upsert = true;
  if (options.multi) mongoOpts.multi = true;
  // Lets you get a more more full result from MongoDB. Use with caution:
  // might not work with C.upsert (as opposed to C.update({upsert:true}) or
  // with simulated upsert.
  if (options.fullResult) mongoOpts.fullResult = true;

  var mongoSelector = replaceTypes(selector, replaceMeteorAtomWithMongo);
  var mongoMod = replaceTypes(mod, replaceMeteorAtomWithMongo);

  var isModify = LocalCollection._isModificationMod(mongoMod);

  if (options._forbidReplace && !isModify) {
    var err = new Error("Invalid modifier. Replacements are forbidden.");
    throw err;
  }

  // We've already run replaceTypes/replaceMeteorAtomWithMongo on
  // selector and mod.  We assume it doesn't matter, as far as
  // the behavior of modifiers is concerned, whether `_modify`
  // is run on EJSON or on mongo-converted EJSON.

  // Run this code up front so that it fails fast if someone uses
  // a Mongo update operator we don't support.
  let knownId;
  if (options.upsert) {
    try {
      let newDoc = LocalCollection._createUpsertDocument(selector, mod);
      knownId = newDoc._id;
    } catch (err) {
      throw err;
    }
  }
  if (options.upsert &&
      ! isModify &&
      ! knownId &&
      options.insertedId &&
      ! (options.insertedId instanceof Mongo.ObjectID &&
         options.generatedId)) {
    // In case of an upsert with a replacement, where there is no _id defined
    // in either the query or the replacement doc, mongo will generate an id itself.
    // Therefore we need this special strategy if we want to control the id ourselves.

    // We don't need to do this when:
    // - This is not a replacement, so we can add an _id to $setOnInsert
    // - The id is defined by query or mod we can just add it to the replacement doc
    // - The user did not specify any id preference and the id is a Mongo ObjectId,
    //     then we can just let Mongo generate the id
    return await simulateUpsertWithInsertedId(collection, mongoSelector, mongoMod, options)
        .then(async result => {
          await refresh();
          await write.committed();
          if (result && ! options._returnObject) {
            return result.numberAffected;
          } else {
            return result;
          }
        });
  } else {
    if (options.upsert && !knownId && options.insertedId && isModify) {
      if (!mongoMod.hasOwnProperty('$setOnInsert')) {
        mongoMod.$setOnInsert = {};
      }
      knownId = options.insertedId;
      Object.assign(mongoMod.$setOnInsert, replaceTypes({_id: options.insertedId}, replaceMeteorAtomWithMongo));
    }

    const strings = Object.keys(mongoMod).filter((key) => !key.startsWith("$"));
    let updateMethod = strings.length > 0 ? 'replaceOne' : 'updateMany';
    updateMethod =
        updateMethod === 'updateMany' && !mongoOpts.multi
            ? 'updateOne'
            : updateMethod;
    return collection[updateMethod]
        .bind(collection)(mongoSelector, mongoMod, mongoOpts)
        .then(async result => {
          var meteorResult = transformResult({result});
          if (meteorResult && options._returnObject) {
            // If this was an upsertAsync() call, and we ended up
            // inserting a new doc and we know its id, then
            // return that id as well.
            if (options.upsert && meteorResult.insertedId) {
              if (knownId) {
                meteorResult.insertedId = knownId;
              } else if (meteorResult.insertedId instanceof MongoDB.ObjectID) {
                meteorResult.insertedId = new Mongo.ObjectID(meteorResult.insertedId.toHexString());
              }
            }
            await refresh();
            await write.committed();
            return meteorResult;
          } else {
            await refresh();
            await write.committed();
            return meteorResult.numberAffected;
          }
        }).catch(async (err) => {
          await write.committed();
          throw err;
        });
  }
};

var transformResult = function (driverResult) {
  var meteorResult = { numberAffected: 0 };
  if (driverResult) {
    var mongoResult = driverResult.result;
    // On updates with upsert:true, the inserted values come as a list of
    // upserted values -- even with options.multi, when the upsert does insert,
    // it only inserts one element.
    if (mongoResult.upsertedCount) {
      meteorResult.numberAffected = mongoResult.upsertedCount;

      if (mongoResult.upsertedId) {
        meteorResult.insertedId = mongoResult.upsertedId;
      }
    } else {
      // n was used before Mongo 5.0, in Mongo 5.0 we are not receiving this n
      // field and so we are using modifiedCount instead
      meteorResult.numberAffected = mongoResult.n || mongoResult.matchedCount || mongoResult.modifiedCount;
    }
  }

  return meteorResult;
};


var NUM_OPTIMISTIC_TRIES = 3;

// exposed for testing
MongoConnection._isCannotChangeIdError = function (err) {

  // Mongo 3.2.* returns error as next Object:
  // {name: String, code: Number, errmsg: String}
  // Older Mongo returns:
  // {name: String, code: Number, err: String}
  var error = err.errmsg || err.err;

  // We don't use the error code here
  // because the error code we observed it producing (16837) appears to be
  // a far more generic error code based on examining the source.
  if (error.indexOf('The _id field cannot be changed') === 0
    || error.indexOf("the (immutable) field '_id' was found to have been altered to _id") !== -1) {
    return true;
  }

  return false;
};

var simulateUpsertWithInsertedId = async function (collection, selector, mod, options) {
  // STRATEGY: First try doing an upsert with a generated ID.
  // If this throws an error about changing the ID on an existing document
  // then without affecting the database, we know we should probably try
  // an update without the generated ID. If it affected 0 documents,
  // then without affecting the database, we the document that first
  // gave the error is probably removed and we need to try an insert again
  // We go back to step one and repeat.
  // Like all "optimistic write" schemes, we rely on the fact that it's
  // unlikely our writes will continue to be interfered with under normal
  // circumstances (though sufficiently heavy contention with writers
  // disagreeing on the existence of an object will cause writes to fail
  // in theory).

  var insertedId = options.insertedId; // must exist
  var mongoOptsForUpdate = {
    safe: true,
    multi: options.multi
  };
  var mongoOptsForInsert = {
    safe: true,
    upsert: true
  };

  var replacementWithId = Object.assign(
    replaceTypes({_id: insertedId}, replaceMeteorAtomWithMongo),
    mod);

  var tries = NUM_OPTIMISTIC_TRIES;

  var doUpdate = async function () {
    tries--;
    if (! tries) {
      throw new Error("Upsert failed after " + NUM_OPTIMISTIC_TRIES + " tries.");
    } else {
      let method = collection.updateMany;
      if(!Object.keys(mod).some(key => key.startsWith("$"))){
        method = collection.replaceOne.bind(collection);
      }
      return method(
        selector,
        mod,
        mongoOptsForUpdate).then(result => {
        if (result && (result.modifiedCount || result.upsertedCount)) {
          return {
            numberAffected: result.modifiedCount || result.upsertedCount,
            insertedId: result.upsertedId || undefined,
          };
        } else {
          return doConditionalInsert();
        }
      });
    }
  };

  var doConditionalInsert = function() {
    return collection.replaceOne(selector, replacementWithId, mongoOptsForInsert)
        .then(result => ({
            numberAffected: result.upsertedCount,
            insertedId: result.upsertedId,
          })).catch(err => {
        if (MongoConnection._isCannotChangeIdError(err)) {
          return doUpdate();
        } else {
          throw err;
        }
      });

  };
  return doUpdate();
};


// XXX MongoConnection.upsertAsync() does not return the id of the inserted document
// unless you set it explicitly in the selector or modifier (as a replacement
// doc).
MongoConnection.prototype.upsertAsync = async function (collectionName, selector, mod, options) {
  var self = this;



  if (typeof options === "function" && ! callback) {
    callback = options;
    options = {};
  }

  return self.updateAsync(collectionName, selector, mod,
                     Object.assign({}, options, {
                       upsert: true,
                       _returnObject: true
                     }));
};

MongoConnection.prototype.find = function (collectionName, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  return new Cursor(
    self, new CursorDescription(collectionName, selector, options));
};

MongoConnection.prototype.findOneAsync = async function (collection_name, selector, options) {
  var self = this;
  if (arguments.length === 1) {
    selector = {};
  }

  options = options || {};
  options.limit = 1;

  const results = await self.find(collection_name, selector, options).fetch();

  return results[0];
};

// We'll actually design an index API later. For now, we just pass through to
// Mongo's, but make it synchronous.
MongoConnection.prototype.createIndexAsync = async function (collectionName, index,
                                                   options) {
  var self = this;

  // We expect this function to be called at startup, not from within a method,
  // so we don't interact with the write fence.
  var collection = self.rawCollection(collectionName);
  await collection.createIndex(index, options);
};

// just to be consistent with the other methods
MongoConnection.prototype.createIndex =
  MongoConnection.prototype.createIndexAsync;

MongoConnection.prototype.countDocuments = function (collectionName, ...args) {
  args = args.map(arg => replaceTypes(arg, replaceMeteorAtomWithMongo));
  const collection = this.rawCollection(collectionName);
  return collection.countDocuments(...args);
};

MongoConnection.prototype.estimatedDocumentCount = function (collectionName, ...args) {
  args = args.map(arg => replaceTypes(arg, replaceMeteorAtomWithMongo));
  const collection = this.rawCollection(collectionName);
  return collection.estimatedDocumentCount(...args);
};

MongoConnection.prototype.ensureIndexAsync = MongoConnection.prototype.createIndexAsync;

MongoConnection.prototype.dropIndexAsync = async function (collectionName, index) {
  var self = this;


  // This function is only used by test code, not within a method, so we don't
  // interact with the write fence.
  var collection = self.rawCollection(collectionName);
  var indexName =  await collection.dropIndex(index);
};


CLIENT_ONLY_METHODS.forEach(function (m) {
  MongoConnection.prototype[m] = function () {
    throw new Error(
      `${m} +  is not available on the server. Please use ${getAsyncMethodName(
        m
      )}() instead.`
    );
  };
});

// CURSORS

// There are several classes which relate to cursors:
//
// CursorDescription represents the arguments used to construct a cursor:
// collectionName, selector, and (find) options.  Because it is used as a key
// for cursor de-dup, everything in it should either be JSON-stringifiable or
// not affect observeChanges output (eg, options.transform functions are not
// stringifiable but do not affect observeChanges).
//
// SynchronousCursor is a wrapper around a MongoDB cursor
// which includes fully-synchronous versions of forEach, etc.
//
// Cursor is the cursor object returned from find(), which implements the
// documented Mongo.Collection cursor API.  It wraps a CursorDescription and a
// SynchronousCursor (lazily: it doesn't contact Mongo until you call a method
// like fetch or forEach on it).
//
// ObserveHandle is the "observe handle" returned from observeChanges. It has a
// reference to an ObserveMultiplexer.
//
// ObserveMultiplexer allows multiple identical ObserveHandles to be driven by a
// single observe driver.
//
// There are two "observe drivers" which drive ObserveMultiplexers:
//   - PollingObserveDriver caches the results of a query and reruns it when
//     necessary.
//   - OplogObserveDriver follows the Mongo operation log to directly observe
//     database changes.
// Both implementations follow the same simple interface: when you create them,
// they start sending observeChanges callbacks (and a ready() invocation) to
// their ObserveMultiplexer, and you stop them by calling their stop() method.

CursorDescription = function (collectionName, selector, options) {
  var self = this;
  self.collectionName = collectionName;
  self.selector = Mongo.Collection._rewriteSelector(selector);
  self.options = options || {};
};

Cursor = function (mongo, cursorDescription) {
  var self = this;

  self._mongo = mongo;
  self._cursorDescription = cursorDescription;
  self._synchronousCursor = null;
};

function setupSynchronousCursor(cursor, method) {
  // You can only observe a tailable cursor.
  if (cursor._cursorDescription.options.tailable)
    throw new Error('Cannot call ' + method + ' on a tailable cursor');

  if (!cursor._synchronousCursor) {
    cursor._synchronousCursor = cursor._mongo._createSynchronousCursor(
      cursor._cursorDescription,
      {
        // Make sure that the "cursor" argument to forEach/map callbacks is the
        // Cursor, not the SynchronousCursor.
        selfForIteration: cursor,
        useTransform: true,
      }
    );
  }

  return cursor._synchronousCursor;
}


Cursor.prototype.countAsync = async function () {
  const collection = this._mongo.rawCollection(this._cursorDescription.collectionName);
  return await collection.countDocuments(
    replaceTypes(this._cursorDescription.selector, replaceMeteorAtomWithMongo),
    replaceTypes(this._cursorDescription.options, replaceMeteorAtomWithMongo),
  );
};

Cursor.prototype.count = function () {
  throw new Error(
    "count() is not available on the server. Please use countAsync() instead."
  );
};

[...ASYNC_CURSOR_METHODS, Symbol.iterator, Symbol.asyncIterator].forEach(methodName => {
  // count is handled specially since we don't want to create a cursor.
  // it is still included in ASYNC_CURSOR_METHODS because we still want an async version of it to exist.
  if (methodName === 'count') {
    return
  }
  Cursor.prototype[methodName] = function (...args) {
    const cursor = setupSynchronousCursor(this, methodName);
    return cursor[methodName](...args);
  };

  // These methods are handled separately.
  if (methodName === Symbol.iterator || methodName === Symbol.asyncIterator) {
    return;
  }

  const methodNameAsync = getAsyncMethodName(methodName);
  Cursor.prototype[methodNameAsync] = function (...args) {
    try {
      return Promise.resolve(this[methodName](...args));
    } catch (error) {
      return Promise.reject(error);
    }
  };
});

Cursor.prototype.getTransform = function () {
  return this._cursorDescription.options.transform;
};

// When you call Meteor.publish() with a function that returns a Cursor, we need
// to transmute it into the equivalent subscription.  This is the function that
// does that.
Cursor.prototype._publishCursor = function (sub) {
  var self = this;
  var collection = self._cursorDescription.collectionName;
  return Mongo.Collection._publishCursor(self, sub, collection);
};

// Used to guarantee that publish functions return at most one cursor per
// collection. Private, because we might later have cursors that include
// documents from multiple collections somehow.
Cursor.prototype._getCollectionName = function () {
  var self = this;
  return self._cursorDescription.collectionName;
};

Cursor.prototype.observe = function (callbacks) {
  var self = this;
  return LocalCollection._observeFromObserveChanges(self, callbacks);
};

Cursor.prototype.observeAsync = function (callbacks) {
  return new Promise(resolve => resolve(this.observe(callbacks)));
};

Cursor.prototype.observeChanges = function (callbacks, options = {}) {
  var self = this;
  var methods = [
    'addedAt',
    'added',
    'changedAt',
    'changed',
    'removedAt',
    'removed',
    'movedTo'
  ];
  var ordered = LocalCollection._observeChangesCallbacksAreOrdered(callbacks);

  let exceptionName = callbacks._fromObserve ? 'observe' : 'observeChanges';
  exceptionName += ' callback';
  methods.forEach(function (method) {
    if (callbacks[method] && typeof callbacks[method] == "function") {
      callbacks[method] = Meteor.bindEnvironment(callbacks[method], method + exceptionName);
    }
  });

  return self._mongo._observeChanges(
    self._cursorDescription, ordered, callbacks, options.nonMutatingCallbacks);
};

Cursor.prototype.observeChangesAsync = async function (callbacks, options = {}) {
  return this.observeChanges(callbacks, options);
};

MongoConnection.prototype._createSynchronousCursor = function(
    cursorDescription, options = {}) {
  var self = this;
  const { selfForIteration, useTransform } = options; 
  options = { selfForIteration, useTransform };

  var collection = self.rawCollection(cursorDescription.collectionName);
  var cursorOptions = cursorDescription.options;
  var mongoOptions = {
    sort: cursorOptions.sort,
    limit: cursorOptions.limit,
    skip: cursorOptions.skip,
    projection: cursorOptions.fields || cursorOptions.projection,
    readPreference: cursorOptions.readPreference,
  };

  // Do we want a tailable cursor (which only works on capped collections)?
  if (cursorOptions.tailable) {
    mongoOptions.numberOfRetries = -1;
  }

  var dbCursor = collection.find(
    replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo),
    mongoOptions);

  // Do we want a tailable cursor (which only works on capped collections)?
  if (cursorOptions.tailable) {
    // We want a tailable cursor...
    dbCursor.addCursorFlag("tailable", true)
    // ... and for the server to wait a bit if any getMore has no data (rather
    // than making us put the relevant sleeps in the client)...
    dbCursor.addCursorFlag("awaitData", true)

    // And if this is on the oplog collection and the cursor specifies a 'ts',
    // then set the undocumented oplog replay flag, which does a special scan to
    // find the first document (instead of creating an index on ts). This is a
    // very hard-coded Mongo flag which only works on the oplog collection and
    // only works with the ts field.
    if (cursorDescription.collectionName === OPLOG_COLLECTION &&
        cursorDescription.selector.ts) {
      dbCursor.addCursorFlag("oplogReplay", true)
    }
  }

  if (typeof cursorOptions.maxTimeMs !== 'undefined') {
    dbCursor = dbCursor.maxTimeMS(cursorOptions.maxTimeMs);
  }
  if (typeof cursorOptions.hint !== 'undefined') {
    dbCursor = dbCursor.hint(cursorOptions.hint);
  }

  return new AsynchronousCursor(dbCursor, cursorDescription, options, collection);
};

/**
 * This is just a light wrapper for the cursor. The goal here is to ensure compatibility even if
 * there are breaking changes on the MongoDB driver.
 *
 * @constructor
 */
class AsynchronousCursor {
  constructor(dbCursor, cursorDescription, options) {
    this._dbCursor = dbCursor;
    this._cursorDescription = cursorDescription;

    this._selfForIteration = options.selfForIteration || this;
    if (options.useTransform && cursorDescription.options.transform) {
      this._transform = LocalCollection.wrapTransform(
          cursorDescription.options.transform);
    } else {
      this._transform = null;
    }

    this._visitedIds = new LocalCollection._IdMap;
  }

  [Symbol.asyncIterator]() {
    var cursor = this;
    return {
      async next() {
        const value = await cursor._nextObjectPromise();
        return { done: !value, value };
      },
    };
  }

  // Returns a Promise for the next object from the underlying cursor (before
  // the Mongo->Meteor type replacement).
  async _rawNextObjectPromise() {
    try {
      return this._dbCursor.next();
    } catch (e) {
      console.error(e);
    }
  }

  // Returns a Promise for the next object from the cursor, skipping those whose
  // IDs we've already seen and replacing Mongo atoms with Meteor atoms.
  async _nextObjectPromise () {
    while (true) {
      var doc = await this._rawNextObjectPromise();

      if (!doc) return null;
      doc = replaceTypes(doc, replaceMongoAtomWithMeteor);

      if (!this._cursorDescription.options.tailable && doc._id) {
        // Did Mongo give us duplicate documents in the same cursor? If so,
        // ignore this one. (Do this before the transform, since transform might
        // return some unrelated value.) We don't do this for tailable cursors,
        // because we want to maintain O(1) memory usage. And if there isn't _id
        // for some reason (maybe it's the oplog), then we don't do this either.
        // (Be careful to do this for falsey but existing _id, though.)
        if (this._visitedIds.has(doc._id)) continue;
        this._visitedIds.set(doc._id, true);
      }

      if (this._transform)
        doc = this._transform(doc);

      return doc;
    }
  }

  // Returns a promise which is resolved with the next object (like with
  // _nextObjectPromise) or rejected if the cursor doesn't return within
  // timeoutMS ms.
  _nextObjectPromiseWithTimeout(timeoutMS) {
    if (!timeoutMS) {
      return this._nextObjectPromise();
    }
    const nextObjectPromise = this._nextObjectPromise();
    const timeoutErr = new Error('Client-side timeout waiting for next object');
    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(timeoutErr);
      }, timeoutMS);
    });
    return Promise.race([nextObjectPromise, timeoutPromise])
        .catch((err) => {
          if (err === timeoutErr) {
            this.close();
          }
          throw err;
        });
  }

  async forEach(callback, thisArg) {
    // Get back to the beginning.
    this._rewind();

    let idx = 0;
    while (true) {
      const doc = await this._nextObjectPromise();
      if (!doc) return;
      await callback.call(thisArg, doc, idx++, this._selfForIteration);
    }
  }

  async map(callback, thisArg) {
    const results = [];
    await this.forEach(async (doc, index) => {
      results.push(await callback.call(thisArg, doc, index, this._selfForIteration));
    });

    return results;
  }

  _rewind() {
    // known to be synchronous
    this._dbCursor.rewind();

    this._visitedIds = new LocalCollection._IdMap;
  }

  // Mostly usable for tailable cursors.
  close() {
    this._dbCursor.close();
  }

  fetch() {
    var self = this;
    return self.map(x => x);
  }

  /**
   * FIXME: (node:34680) [MONGODB DRIVER] Warning: cursor.count is deprecated and will be
   *  removed in the next major version, please use `collection.estimatedDocumentCount` or
   *  `collection.countDocuments` instead.
   */
  count() {
    return this._dbCursor.count();
  }

  // This method is NOT wrapped in Cursor.
  async getRawObjects(ordered) {
    var self = this;
    if (ordered) {
      return self.fetch();
    } else {
      var results = new LocalCollection._IdMap;
      await self.forEach(function (doc) {
        results.set(doc._id, doc);
      });
      return results;
    }
  }
}

var SynchronousCursor = function (dbCursor, cursorDescription, options, collection) {
  var self = this;
  const { selfForIteration, useTransform } = options; 
  options = { selfForIteration, useTransform };

  self._dbCursor = dbCursor;
  self._cursorDescription = cursorDescription;
  // The "self" argument passed to forEach/map callbacks. If we're wrapped
  // inside a user-visible Cursor, we want to provide the outer cursor!
  self._selfForIteration = options.selfForIteration || self;
  if (options.useTransform && cursorDescription.options.transform) {
    self._transform = LocalCollection.wrapTransform(
      cursorDescription.options.transform);
  } else {
    self._transform = null;
  }

  self._synchronousCount = Future.wrap(
    collection.countDocuments.bind(
      collection,
      replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo),
      replaceTypes(cursorDescription.options, replaceMeteorAtomWithMongo),
    )
  );
  self._visitedIds = new LocalCollection._IdMap;
};

Object.assign(SynchronousCursor.prototype, {
  // Returns a Promise for the next object from the underlying cursor (before
  // the Mongo->Meteor type replacement).
  _rawNextObjectPromise: function () {
    const self = this;
    return new Promise((resolve, reject) => {
      self._dbCursor.next((err, doc) => {
        if (err) {
          reject(err);
        } else {
          resolve(doc);
        }
      });
    });
  },

  // Returns a Promise for the next object from the cursor, skipping those whose
  // IDs we've already seen and replacing Mongo atoms with Meteor atoms.
  _nextObjectPromise: async function () {
    var self = this;

    while (true) {
      var doc = await self._rawNextObjectPromise();

      if (!doc) return null;
      doc = replaceTypes(doc, replaceMongoAtomWithMeteor);

      if (!self._cursorDescription.options.tailable && has(doc, '_id')) {
        // Did Mongo give us duplicate documents in the same cursor? If so,
        // ignore this one. (Do this before the transform, since transform might
        // return some unrelated value.) We don't do this for tailable cursors,
        // because we want to maintain O(1) memory usage. And if there isn't _id
        // for some reason (maybe it's the oplog), then we don't do this either.
        // (Be careful to do this for falsey but existing _id, though.)
        if (self._visitedIds.has(doc._id)) continue;
        self._visitedIds.set(doc._id, true);
      }

      if (self._transform)
        doc = self._transform(doc);

      return doc;
    }
  },

  // Returns a promise which is resolved with the next object (like with
  // _nextObjectPromise) or rejected if the cursor doesn't return within
  // timeoutMS ms.
  _nextObjectPromiseWithTimeout: function (timeoutMS) {
    const self = this;
    if (!timeoutMS) {
      return self._nextObjectPromise();
    }
    const nextObjectPromise = self._nextObjectPromise();
    const timeoutErr = new Error('Client-side timeout waiting for next object');
    const timeoutPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(timeoutErr);
      }, timeoutMS);
    });
    return Promise.race([nextObjectPromise, timeoutPromise])
      .catch((err) => {
        if (err === timeoutErr) {
          self.close();
        }
        throw err;
      });
  },

  _nextObject: function () {
    var self = this;
    return self._nextObjectPromise().await();
  },

  forEach: function (callback, thisArg) {
    var self = this;
    const wrappedFn = Meteor.wrapFn(callback);

    // Get back to the beginning.
    self._rewind();

    // We implement the loop ourself instead of using self._dbCursor.each,
    // because "each" will call its callback outside of a fiber which makes it
    // much more complex to make this function synchronous.
    var index = 0;
    while (true) {
      var doc = self._nextObject();
      if (!doc) return;
      wrappedFn.call(thisArg, doc, index++, self._selfForIteration);
    }
  },

  // XXX Allow overlapping callback executions if callback yields.
  map: function (callback, thisArg) {
    var self = this;
    const wrappedFn = Meteor.wrapFn(callback);
    var res = [];
    self.forEach(function (doc, index) {
      res.push(wrappedFn.call(thisArg, doc, index, self._selfForIteration));
    });
    return res;
  },

  _rewind: function () {
    var self = this;

    // known to be synchronous
    self._dbCursor.rewind();

    self._visitedIds = new LocalCollection._IdMap;
  },

  // Mostly usable for tailable cursors.
  close: function () {
    var self = this;

    self._dbCursor.close();
  },

  fetch: function () {
    var self = this;
    return self.map(identity);
  },

  count: function () {
    var self = this;
    return self._synchronousCount().wait();
  },

  // This method is NOT wrapped in Cursor.
  getRawObjects: function (ordered) {
    var self = this;
    if (ordered) {
      return self.fetch();
    } else {
      var results = new LocalCollection._IdMap;
      self.forEach(function (doc) {
        results.set(doc._id, doc);
      });
      return results;
    }
  }
});

SynchronousCursor.prototype[Symbol.iterator] = function () {
  var self = this;

  // Get back to the beginning.
  self._rewind();

  return {
    next() {
      const doc = self._nextObject();
      return doc ? {
        value: doc
      } : {
        done: true
      };
    }
  };
};

SynchronousCursor.prototype[Symbol.asyncIterator] = function () {
  const syncResult = this[Symbol.iterator]();
  return {
    async next() {
      return Promise.resolve(syncResult.next());
    }
  };
}

// Tails the cursor described by cursorDescription, most likely on the
// oplog. Calls docCallback with each document found. Ignores errors and just
// restarts the tail on error.
//
// If timeoutMS is set, then if we don't get a new document every timeoutMS,
// kill and restart the cursor. This is primarily a workaround for #8598.
MongoConnection.prototype.tail = function (cursorDescription, docCallback, timeoutMS) {
  var self = this;
  if (!cursorDescription.options.tailable)
    throw new Error("Can only tail a tailable cursor");

  var cursor = self._createSynchronousCursor(cursorDescription);

  var stopped = false;
  var lastTS;

  Meteor.defer(async function loop() {
    var doc = null;
    while (true) {
      if (stopped)
        return;
      try {
        doc = await cursor._nextObjectPromiseWithTimeout(timeoutMS);
      } catch (err) {
        // There's no good way to figure out if this was actually an error from
        // Mongo, or just client-side (including our own timeout error). Ah
        // well. But either way, we need to retry the cursor (unless the failure
        // was because the observe got stopped).
        doc = null;
      }
      // Since we awaited a promise above, we need to check again to see if
      // we've been stopped before calling the callback.
      if (stopped)
        return;
      if (doc) {
        // If a tailable cursor contains a "ts" field, use it to recreate the
        // cursor on error. ("ts" is a standard that Mongo uses internally for
        // the oplog, and there's a special flag that lets you do binary search
        // on it instead of needing to use an index.)
        lastTS = doc.ts;
        docCallback(doc);
      } else {
        var newSelector = Object.assign({}, cursorDescription.selector);
        if (lastTS) {
          newSelector.ts = {$gt: lastTS};
        }
        cursor = self._createSynchronousCursor(new CursorDescription(
          cursorDescription.collectionName,
          newSelector,
          cursorDescription.options));
        // Mongo failover takes many seconds.  Retry in a bit.  (Without this
        // setTimeout, we peg the CPU at 100% and never notice the actual
        // failover.
        setTimeout(loop, 100);
        break;
      }
    }
  });

  return {
    stop: function () {
      stopped = true;
      cursor.close();
    }
  };
};

const oplogCollectionWarnings = [];

Object.assign(MongoConnection.prototype, {
  _observeChanges: async function (
      cursorDescription, ordered, callbacks, nonMutatingCallbacks) {
    var self = this;
    const collectionName = cursorDescription.collectionName;

    if (cursorDescription.options.tailable) {
      return self._observeChangesTailable(cursorDescription, ordered, callbacks);
    }

    // You may not filter out _id when observing changes, because the id is a core
    // part of the observeChanges API.
    const fieldsOptions = cursorDescription.options.projection || cursorDescription.options.fields;
    if (fieldsOptions &&
        (fieldsOptions._id === 0 ||
            fieldsOptions._id === false)) {
      throw Error("You may not observe a cursor with {fields: {_id: 0}}");
    }

  var observeKey = EJSON.stringify(
    Object.assign({ordered: ordered}, cursorDescription));

    var multiplexer, observeDriver;
    var firstHandle = false;

    // Find a matching ObserveMultiplexer, or create a new one. This next block is
    // guaranteed to not yield (and it doesn't call anything that can observe a
    // new query), so no other calls to this function can interleave with it.
    if (has(self._observeMultiplexers, observeKey)) {
      multiplexer = self._observeMultiplexers[observeKey];
    } else {
      firstHandle = true;
      // Create a new ObserveMultiplexer.
      multiplexer = new ObserveMultiplexer({
        ordered: ordered,
        onStop: function () {
          delete self._observeMultiplexers[observeKey];
          return observeDriver.stop();
        }
      });
    }

    var observeHandle = new ObserveHandle(multiplexer,
        callbacks,
        nonMutatingCallbacks,
    );

    const oplogOptions = self?._oplogHandle?._oplogOptions || {};
  const { includeCollections, excludeCollections } = oplogOptions;
  if (firstHandle) {
      var matcher, sorter;
    var canUseOplog = [
        function () {
          // At a bare minimum, using the oplog requires us to have an oplog, to
          // want unordered callbacks, and to not want a callback on the polls
          // that won't happen.
          return self._oplogHandle && !ordered &&
            !callbacks._testOnlyPollCallback;
  },
      function () {
        // We also need to check, if the collection of this Cursor is actually being "watched" by the Oplog handle
        // if not, we have to fallback to long polling
        if (excludeCollections?.length && excludeCollections.includes(collectionName)) {
          if (!oplogCollectionWarnings.includes(collectionName)) {
            console.warn(`Meteor.settings.packages.mongo.oplogExcludeCollections includes the collection ${collectionName} - your subscriptions will only use long polling!`);
            oplogCollectionWarnings.push(collectionName); // we only want to show the warnings once per collection!
          }
          return false;
        }
        if (includeCollections?.length && !includeCollections.includes(collectionName)) {
          if (!oplogCollectionWarnings.includes(collectionName)) {
            console.warn(`Meteor.settings.packages.mongo.oplogIncludeCollections does not include the collection ${collectionName} - your subscriptions will only use long polling!`);
            oplogCollectionWarnings.push(collectionName); // we only want to show the warnings once per collection!
          }
          return false;
        }
        return true;
      },
      function () {
        // We need to be able to compile the selector. Fall back to polling for
        // some newfangled $selector that minimongo doesn't support yet.
        try {
          matcher = new Minimongo.Matcher(cursorDescription.selector);
          return true;
        } catch (e) {
          // XXX make all compilation errors MinimongoError or something
          //     so that this doesn't ignore unrelated exceptions
          return false;
        }
      },
      function () {
        // ... and the selector itself needs to support oplog.
        return OplogObserveDriver.cursorSupported(cursorDescription, matcher);
      },
      function () {
        // And we need to be able to compile the sort, if any.  eg, can't be
        // {$natural: 1}.
        if (!cursorDescription.options.sort)
          return true;
        try {
          sorter = new Minimongo.Sorter(cursorDescription.options.sort);
          return true;
        } catch (e) {
          // XXX make all compilation errors MinimongoError or something
          //     so that this doesn't ignore unrelated exceptions
          return false;
        }
      }
    ].every(f => f());  // invoke each function and check if all return true

    var driverClass = canUseOplog ? OplogObserveDriver : PollingObserveDriver;
    observeDriver = new driverClass({
      cursorDescription: cursorDescription,
      mongoHandle: self,
      multiplexer: multiplexer,
      ordered: ordered,
      matcher: matcher,  // ignored by polling
      sorter: sorter,  // ignored by polling
      _testOnlyPollCallback: callbacks._testOnlyPollCallback
});

    if (observeDriver._init) {
      await observeDriver._init();
    }

    // This field is only set for use in tests.
    multiplexer._observeDriver = observeDriver;
  }
  self._observeMultiplexers[observeKey] = multiplexer;
  // Blocks until the initial adds have been sent.
  await multiplexer.addHandleAndSendInitialAdds(observeHandle);

  return observeHandle;
},

});


// Listen for the invalidation messages that will trigger us to poll the
// database for changes. If this selector specifies specific IDs, specify them
// here, so that updates to different specific IDs don't cause us to poll.
// listenCallback is the same kind of (notification, complete) callback passed
// to InvalidationCrossbar.listen.

listenAll = async function (cursorDescription, listenCallback) {
  const listeners = [];
  await forEachTrigger(cursorDescription, function (trigger) {
    listeners.push(DDPServer._InvalidationCrossbar.listen(
      trigger, listenCallback));
  });

  return {
    stop: function () {
      listeners.forEach(function (listener) {
        listener.stop();
      });
    }
  };
};

forEachTrigger = async function (cursorDescription, triggerCallback) {
  const key = {collection: cursorDescription.collectionName};
  const specificIds = LocalCollection._idsMatchedBySelector(
    cursorDescription.selector);
  if (specificIds) {
    for (const id of specificIds) {
      await triggerCallback(Object.assign({id: id}, key));
    }
    await triggerCallback(Object.assign({dropCollection: true, id: null}, key));
  } else {
    await triggerCallback(key);
  }
  // Everyone cares about the database being dropped.
  await triggerCallback({ dropDatabase: true });
};

// observeChanges for tailable cursors on capped collections.
//
// Some differences from normal cursors:
//   - Will never produce anything other than 'added' or 'addedBefore'. If you
//     do update a document that has already been produced, this will not notice
//     it.
//   - If you disconnect and reconnect from Mongo, it will essentially restart
//     the query, which will lead to duplicate results. This is pretty bad,
//     but if you include a field called 'ts' which is inserted as
//     new MongoInternals.MongoTimestamp(0, 0) (which is initialized to the
//     current Mongo-style timestamp), we'll be able to find the place to
//     restart properly. (This field is specifically understood by Mongo with an
//     optimization which allows it to find the right place to start without
//     an index on ts. It's how the oplog works.)
//   - No callbacks are triggered synchronously with the call (there's no
//     differentiation between "initial data" and "later changes"; everything
//     that matches the query gets sent asynchronously).
//   - De-duplication is not implemented.
//   - Does not yet interact with the write fence. Probably, this should work by
//     ignoring removes (which don't work on capped collections) and updates
//     (which don't affect tailable cursors), and just keeping track of the ID
//     of the inserted object, and closing the write fence once you get to that
//     ID (or timestamp?).  This doesn't work well if the document doesn't match
//     the query, though.  On the other hand, the write fence can close
//     immediately if it does not match the query. So if we trust minimongo
//     enough to accurately evaluate the query against the write fence, we
//     should be able to do this...  Of course, minimongo doesn't even support
//     Mongo Timestamps yet.
MongoConnection.prototype._observeChangesTailable = function (
    cursorDescription, ordered, callbacks) {
  var self = this;

  // Tailable cursors only ever call added/addedBefore callbacks, so it's an
  // error if you didn't provide them.
  if ((ordered && !callbacks.addedBefore) ||
      (!ordered && !callbacks.added)) {
    throw new Error("Can't observe an " + (ordered ? "ordered" : "unordered")
                    + " tailable cursor without a "
                    + (ordered ? "addedBefore" : "added") + " callback");
  }

  return self.tail(cursorDescription, function (doc) {
    var id = doc._id;
    delete doc._id;
    // The ts is an implementation detail. Hide it.
    delete doc.ts;
    if (ordered) {
      callbacks.addedBefore(id, doc, null);
    } else {
      callbacks.added(id, doc);
    }
  });
};

// XXX We probably need to find a better way to expose this. Right now
// it's only used by tests, but in fact you need it in normal
// operation to interact with capped collections.
MongoInternals.MongoTimestamp = MongoDB.Timestamp;

MongoInternals.Connection = MongoConnection;