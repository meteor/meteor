import { Meteor } from 'meteor/meteor';
import path from 'path';
import { DocFetcher } from './doc_fetcher';
import { ObserveMultiplexer } from './observe_multiplex';
import { ObserveHandle } from './observe_handle';
import { OPLOG_COLLECTION, OplogHandle } from './oplog_tailing';
import { CLIENT_ONLY_METHODS, getAsyncMethodName } from 'meteor/minimongo/constants';
import { OplogObserveDriver } from './oplog_observe_driver';
import { PollingObserveDriver } from './polling_observe_driver';
import { replaceMeteorAtomWithMongo, replaceTypes, transformResult } from './mongo_common';
import { AsynchronousCursor } from './asynchronous_cursor';
import { MongoDB } from './mongo_common';
import { Cursor } from './cursor';
import { CursorDescription } from './cursor_description';

const FILE_ASSET_SUFFIX = 'Asset';
const ASSETS_FOLDER = 'assets';
const APP_FOLDER = 'app';

const oplogCollectionWarnings = [];

export const MongoConnection = function (url, options) {
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
  if ('maxPoolSize' in options) {
    // If we just set this for "server", replSet will override it. If we just
    // set it for replSet, it will be ignored if we're not using a replSet.
    mongoOptions.maxPoolSize = options.maxPoolSize;
  }
  if ('minPoolSize' in options) {
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
            } else if (meteorResult.insertedId instanceof MongoDB.ObjectId) {
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


var NUM_OPTIMISTIC_TRIES = 3;



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

MongoConnection.prototype._createAsynchronousCursor = function(
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

  var cursor = self._createAsynchronousCursor(cursorDescription);

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
        // We should not ignore errors here unless we want to spend a lot of time debugging
        console.error(err);
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
        cursor = self._createAsynchronousCursor(new CursorDescription(
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
    if (observeKey in self._observeMultiplexers) {
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
