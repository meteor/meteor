/**
 * Provide a synchronous Collection API using fibers, backed by
 * MongoDB.  This is only for use on the server, and mostly identical
 * to the client API.
 *
 * NOTE: the public API methods must be run within a fiber. If you call
 * these outside of a fiber they will explode!
 */

var path = Npm.require('path');
var MongoDB = Npm.require('mongodb');
var Fiber = Npm.require('fibers');
var Future = Npm.require(path.join('fibers', 'future'));

MongoInternals = {};

var replaceNames = function (filter, thing) {
  if (typeof thing === "object") {
    if (_.isArray(thing)) {
      return _.map(thing, _.bind(replaceNames, null, filter));
    }
    var ret = {};
    _.each(thing, function (value, key) {
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
    var buffer = document.value(true);
    return new Uint8Array(buffer);
  }
  if (document instanceof MongoDB.ObjectID) {
    return new Meteor.Collection.ObjectID(document.toHexString());
  }
  if (document["EJSON$type"] && document["EJSON$value"]) {
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
    return new MongoDB.Binary(new Buffer(document));
  }
  if (document instanceof Meteor.Collection.ObjectID) {
    return new MongoDB.ObjectID(document.toHexString());
  }
  if (document instanceof MongoDB.Timestamp) {
    // For now, the Meteor representation of a Mongo timestamp type (not a date!
    // this is a weird internal thing used in the oplog!) is the same as the
    // Mongo representation. We need to do this explicitly or else we would do a
    // structural clone and lose the prototype.
    return document;
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
  _.each(document, function (val, key) {
    var valReplaced = replaceTypes(val, atomTransformer);
    if (val !== valReplaced) {
      // Lazy clone. Shallow copy.
      if (ret === document)
        ret = _.clone(document);
      ret[key] = valReplaced;
    }
  });
  return ret;
};


MongoConnection = function (url, options) {
  var self = this;
  options = options || {};
  self._connectCallbacks = [];
  self._liveResultsSets = {};

  var mongoOptions = {db: {safe: true}, server: {}, replSet: {}};

  // Set autoReconnect to true, unless passed on the URL. Why someone
  // would want to set autoReconnect to false, I'm not really sure, but
  // keeping this for backwards compatibility for now.
  if (!(/[\?&]auto_?[rR]econnect=/.test(url))) {
    mongoOptions.server.auto_reconnect = true;
  }

  // Disable the native parser by default, unless specifically enabled
  // in the mongo URL.
  // - The native driver can cause errors which normally would be
  //   thrown, caught, and handled into segfaults that take down the
  //   whole app.
  // - Binary modules don't yet work when you bundle and move the bundle
  //   to a different platform (aka deploy)
  // We should revisit this after binary npm module support lands.
  if (!(/[\?&]native_?[pP]arser=/.test(url))) {
    mongoOptions.db.native_parser = false;
  }

  // XXX maybe we should have a better way of allowing users to configure the
  // underlying Mongo driver
  if (_.has(options, 'poolSize')) {
    // If we just set this for "server", replSet will override it. If we just
    // set it for replSet, it will be ignored if we're not using a replSet.
    mongoOptions.server.poolSize = options.poolSize;
    mongoOptions.replSet.poolSize = options.poolSize;
  }

  MongoDB.connect(url, mongoOptions, function(err, db) {
    if (err)
      throw err;
    self.db = db;

    Fiber(function () {
      // drain queue of pending callbacks
      _.each(self._connectCallbacks, function (c) {
        c(db);
      });
    }).run();
  });

  self._docFetcher = new DocFetcher(self);
  self._oplogHandle = null;

  if (options.oplogUrl) {
    var dbNameFuture = new Future;
    self._withDb(function (db) {
      dbNameFuture.return(db.databaseName);
    });
    self._startOplogTailing(options.oplogUrl, dbNameFuture);
  }
};

MongoConnection.prototype.close = function() {
  var self = this;

  // XXX probably untested
  var oplogHandle = self._oplogHandle;
  self._oplogHandle = null;
  if (oplogHandle)
    oplogHandle.stop();

  // Use Future.wrap so that errors get thrown. This happens to
  // work even outside a fiber since the 'close' method is not
  // actually asynchronous.
  Future.wrap(_.bind(self.db.close, self.db))(true).wait();
};

MongoConnection.prototype._withDb = function (callback) {
  var self = this;
  if (self.db) {
    callback(self.db);
  } else {
    self._connectCallbacks.push(callback);
  }
};

// Returns the Mongo Collection object; may yield.
MongoConnection.prototype._getCollection = function (collectionName) {
  var self = this;

  var future = new Future;
  self._withDb(function (db) {
    db.collection(collectionName, future.resolver());
  });
  return future.wait();
};

MongoConnection.prototype._createCappedCollection = function (collectionName,
                                                              byteSize) {
  var self = this;
  var future = new Future();
  self._withDb(function (db) {
    db.createCollection(collectionName, {capped: true, size: byteSize},
                        future.resolver());
  });
  future.wait();
};

// This should be called synchronously with a write, to create a
// transaction on the current write fence, if any. After we can read
// the write, and after observers have been notified (or at least,
// after the observer notifiers have added themselves to the write
// fence), you should call 'committed()' on the object returned.
MongoConnection.prototype._maybeBeginWrite = function () {
  var self = this;
  var fence = DDPServer._CurrentWriteFence.get();
  if (fence)
    return fence.beginWrite();
  else
    return {committed: function () {}};
};

var OPLOG_COLLECTION = 'oplog.rs';

// Like Perl's quotemeta: quotes all regexp metacharacters. See
//   https://github.com/substack/quotemeta/blob/master/index.js
// XXX this is duplicated with accounts_server.js
var quotemeta = function (str) {
    return String(str).replace(/(\W)/g, '\\$1');
};

var showTS = function (ts) {
  return "Timestamp(" + ts.getHighBits() + ", " + ts.getLowBits() + ")";
};

MongoConnection.prototype._startOplogTailing = function (oplogUrl,
                                                         dbNameFuture) {
  var self = this;

  var oplogLastEntryConnection = null;
  var oplogTailConnection = null;
  var stopped = false;
  var tailHandle = null;
  var readyFuture = new Future();
  var nextId = 0;
  var callbacksByCollection = {};
  var lastProcessedTS = null;
  // Lazily calculate the basic selector. Don't call baseOplogSelector() at the
  // top level of this function, because we don't want this function to block.
  var baseOplogSelector = _.once(function () {
    return {
      ns: new RegExp('^' + quotemeta(dbNameFuture.wait()) + '\\.'),
      // XXX also handle drop collection, etc
      op: {$in: ['i', 'u', 'd']}
    };
  });
  // XXX doc
  var pendingSequencers = [];

  self._oplogHandle = {
    stop: function () {
      if (stopped)
        return;
      stopped = true;
      if (tailHandle)
        tailHandle.stop();
    },

    onOplogEntry: function (collectionName, callback) {
      if (stopped)
        throw new Error("Called onOplogEntry on stopped handle!");

      // Calling onOplogEntry requires us to wait for the tailing to be ready.
      readyFuture.wait();

      callback = Meteor.bindEnvironment(callback, function (err) {
        Meteor._debug("Error in oplog callback", err.stack);
      });
      if (!_.has(callbacksByCollection, collectionName))
        callbacksByCollection[collectionName] = {};
      var callbackId = nextId++;
      callbacksByCollection[collectionName][callbackId] = callback;
      return {
        stop: function () {
          delete callbacksByCollection[collectionName][callbackId];
        }
      };
    },

    // Calls `callback` once the oplog has been processed up to a point that is
    // roughly "now": specifically, once we've processed all ops that are
    // currently visible.
    // XXX become convinced that this is actually safe even if oplogConnection
    // is some kind of pool
    callWhenProcessedLatest: function (callback) {
      if (stopped)
        throw new Error("Called callWhenProcessedLatest on stopped handle!");

      // Calling onOplogEntry requries us to wait for the oplog connection to be
      // ready.
      readyFuture.wait();

      // Except for during startup, we DON'T block.
      Fiber(function () {
        // We need to make the selector at least as restrictive as the actual
        // tailing selector (ie, we need to specify the DB name) or else we
        // might find a TS that won't show up in the actual tail stream.
        var lastEntry = oplogLastEntryConnection.findOne(
          OPLOG_COLLECTION, baseOplogSelector(), {sort: {$natural: -1}});
        if (!lastEntry) {
          // Really, nothing in the oplog? Well, we've processed everything.
          callback();
          return;
        }
        var ts = lastEntry.ts;
        if (!ts)
          throw Error("oplog entry without ts: " + EJSON.stringify(lastEntry));

        if (lastProcessedTS && ts.lessThanOrEqual(lastProcessedTS)) {
          // We've already caught up to here.
          callback();
          return;
        }

        var insertAfter = pendingSequencers.length;
        while (insertAfter - 1 > 0
               && pendingSequencers[insertAfter - 1].ts.greaterThan(ts)) {
          insertAfter--;
        }

        // XXX this can occur if we fail over from one primary to another.  so
        // this check needs to be removed before we merge oplog.  that said, it
        // has been helpful so far at proving that we are properly using
        // poolSize 1. Also, we could keep something like it if we could
        // actually detect failover; see
        // https://github.com/mongodb/node-mongodb-native/issues/1120
        if (insertAfter !== pendingSequencers.length) {
          throw Error("found misordered oplog: "
                      + showTS(_.last(pendingSequencers).ts) + " vs "
                      + showTS(ts));
        }

        pendingSequencers.splice(insertAfter, 0, {ts: ts, callback: callback});
      }).run();
    }
  };

  // Setting up the connections and tail handler is a blocking operation, so we
  // do it "later".
  Meteor.defer(function () {
    // We make two separate connections to Mongo. The Node Mongo driver
    // implements a naive round-robin connection pool: each "connection" is a
    // pool of several (5 by default) TCP connections, and each request is
    // rotated through the pools. Tailable cursor queries block on the server
    // until there is some data to return (or until a few seconds have
    // passed). So if the connection pool used for tailing cursors is the same
    // pool used for other queries, the other queries will be delayed by seconds
    // 1/5 of the time.
    //
    // The tail connection will only ever be running a single tail command, so
    // it only needs to make one underlying TCP connection.
    oplogTailConnection = new MongoConnection(oplogUrl, {poolSize: 1});
    // XXX better docs, but: it's to get monotonic results
    // XXX is it safe to say "if there's an in flight query, just use its
    //     results"? I don't think so but should consider that
    oplogLastEntryConnection = new MongoConnection(oplogUrl, {poolSize: 1});

    // Find the last oplog entry. Blocks until the connection is ready.
    var lastOplogEntry = oplogLastEntryConnection.findOne(
      OPLOG_COLLECTION, {}, {sort: {$natural: -1}});

    var dbName = dbNameFuture.wait();

    var oplogSelector = _.clone(baseOplogSelector());
    if (lastOplogEntry) {
      // Start after the last entry that currently exists.
      oplogSelector.ts = {$gt: lastOplogEntry.ts};
      // If there are any calls to callWhenProcessedLatest before any other
      // oplog entries show up, allow callWhenProcessedLatest to call its
      // callback immediately.
      lastProcessedTS = lastOplogEntry.ts;
    }

    var cursorDescription = new CursorDescription(
      OPLOG_COLLECTION, oplogSelector, {tailable: true});

    tailHandle = oplogTailConnection.tail(cursorDescription, function (doc) {
      if (!(doc.ns && doc.ns.length > dbName.length + 1 &&
            doc.ns.substr(0, dbName.length + 1) === (dbName + '.')))
        throw new Error("Unexpected ns");

      var collectionName = doc.ns.substr(dbName.length + 1);

      _.each(callbacksByCollection[collectionName], function (callback) {
        callback(EJSON.clone(doc));
      });

      // Now that we've processed this operation, process pending sequencers.
      if (!doc.ts)
        throw Error("oplog entry without ts: " + EJSON.stringify(doc));
      lastProcessedTS = doc.ts;
      while (!_.isEmpty(pendingSequencers)
             && pendingSequencers[0].ts.lessThanOrEqual(lastProcessedTS)) {
        var sequencer = pendingSequencers.shift();
        sequencer.callback();
      }
    });
    readyFuture.return();
  });
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
      refresh();
    }
    write.committed();
    if (callback)
      callback(err, result);
    else if (err)
      throw err;
  };
};

var bindEnvironmentForWrite = function (callback) {
  return Meteor.bindEnvironment(callback, function (err) {
    Meteor._debug("Error in Mongo write:", err.stack);
  });
};

MongoConnection.prototype._insert = function (collection_name, document,
                                              callback) {
  var self = this;
  if (collection_name === "___meteor_failure_test_collection") {
    var e = new Error("Failure test");
    e.expected = true;
    if (callback)
      return callback(e);
    else
      throw e;
  }

  var write = self._maybeBeginWrite();
  var refresh = function () {
    Meteor.refresh({ collection: collection_name, id: document._id });
  };
  callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));
  try {
    var collection = self._getCollection(collection_name);
    collection.insert(replaceTypes(document, replaceMeteorAtomWithMongo),
                      {safe: true}, callback);
  } catch (e) {
    write.committed();
    throw e;
  }
};

// Cause queries that may be affected by the selector to poll in this write
// fence.
MongoConnection.prototype._refresh = function (collectionName, selector) {
  var self = this;
  var refreshKey = {collection: collectionName};
  // If we know which documents we're removing, don't poll queries that are
  // specific to other documents. (Note that multiple notifications here should
  // not cause multiple polls, since all our listener is doing is enqueueing a
  // poll.)
  var specificIds = LocalCollection._idsMatchedBySelector(selector);
  if (specificIds) {
    _.each(specificIds, function (id) {
      Meteor.refresh(_.extend({id: id}, refreshKey));
    });
  } else {
    Meteor.refresh(refreshKey);
  }
};

MongoConnection.prototype._remove = function (collection_name, selector,
                                              callback) {
  var self = this;

  if (collection_name === "___meteor_failure_test_collection") {
    var e = new Error("Failure test");
    e.expected = true;
    if (callback)
      return callback(e);
    else
      throw e;
  }

  var write = self._maybeBeginWrite();
  var refresh = function () {
    self._refresh(collection_name, selector);
  };
  callback = bindEnvironmentForWrite(writeCallback(write, refresh, callback));

  try {
    var collection = self._getCollection(collection_name);
    collection.remove(replaceTypes(selector, replaceMeteorAtomWithMongo),
                      {safe: true}, callback);
  } catch (e) {
    write.committed();
    throw e;
  }
};

MongoConnection.prototype._update = function (collection_name, selector, mod,
                                              options, callback) {
  var self = this;

  if (! callback && options instanceof Function) {
    callback = options;
    options = null;
  }

  if (collection_name === "___meteor_failure_test_collection") {
    var e = new Error("Failure test");
    e.expected = true;
    if (callback)
      return callback(e);
    else
      throw e;
  }

  // explicit safety check. null and undefined can crash the mongo
  // driver. Although the node driver and minimongo do 'support'
  // non-object modifier in that they don't crash, they are not
  // meaningful operations and do not do anything. Defensively throw an
  // error here.
  if (!mod || typeof mod !== 'object')
    throw new Error("Invalid modifier. Modifier must be an object.");

  if (!options) options = {};

  var write = self._maybeBeginWrite();
  var refresh = function () {
    self._refresh(collection_name, selector);
  };
  callback = writeCallback(write, refresh, callback);
  try {
    var collection = self._getCollection(collection_name);
    var mongoOpts = {safe: true};
    // explictly enumerate options that minimongo supports
    if (options.upsert) mongoOpts.upsert = true;
    if (options.multi) mongoOpts.multi = true;

    var mongoSelector = replaceTypes(selector, replaceMeteorAtomWithMongo);
    var mongoMod = replaceTypes(mod, replaceMeteorAtomWithMongo);

    var isModify = isModificationMod(mongoMod);
    var knownId = (isModify ? selector._id : mod._id);

    if (options.upsert && (! knownId) && options.insertedId) {
      // XXX In future we could do a real upsert for the mongo id generation
      // case, if the the node mongo driver gives us back the id of the upserted
      // doc (which our current version does not).
      simulateUpsertWithInsertedId(
        collection, mongoSelector, mongoMod,
        isModify, options,
        // This callback does not need to be bindEnvironment'ed because
        // simulateUpsertWithInsertedId() wraps it and then passes it through
        // bindEnvironmentForWrite.
        function (err, result) {
          // If we got here via a upsert() call, then options._returnObject will
          // be set and we should return the whole object. Otherwise, we should
          // just return the number of affected docs to match the mongo API.
          if (result && ! options._returnObject)
            callback(err, result.numberAffected);
          else
            callback(err, result);
        }
      );
    } else {
      collection.update(
        mongoSelector, mongoMod, mongoOpts,
        bindEnvironmentForWrite(function (err, result, extra) {
          if (! err) {
            if (result && options._returnObject) {
              result = { numberAffected: result };
              // If this was an upsert() call, and we ended up
              // inserting a new doc and we know its id, then
              // return that id as well.
              if (options.upsert && knownId &&
                  ! extra.updatedExisting)
                result.insertedId = knownId;
            }
          }
          callback(err, result);
        }));
    }
  } catch (e) {
    write.committed();
    throw e;
  }
};

var isModificationMod = function (mod) {
  for (var k in mod)
    if (k.substr(0, 1) === '$')
      return true;
  return false;
};

var NUM_OPTIMISTIC_TRIES = 3;

// exposed for testing
MongoConnection._isCannotChangeIdError = function (err) {
  // either of these checks should work, but just to be safe...
  return (err.code === 13596 ||
          err.err.indexOf("cannot change _id of a document") === 0);
};

var simulateUpsertWithInsertedId = function (collection, selector, mod,
                                             isModify, options, callback) {
  // STRATEGY:  First try doing a plain update.  If it affected 0 documents,
  // then without affecting the database, we know we should probably do an
  // insert.  We then do a *conditional* insert that will fail in the case
  // of a race condition.  This conditional insert is actually an
  // upsert-replace with an _id, which will never successfully update an
  // existing document.  If this upsert fails with an error saying it
  // couldn't change an existing _id, then we know an intervening write has
  // caused the query to match something.  We go back to step one and repeat.
  // Like all "optimistic write" schemes, we rely on the fact that it's
  // unlikely our writes will continue to be interfered with under normal
  // circumstances (though sufficiently heavy contention with writers
  // disagreeing on the existence of an object will cause writes to fail
  // in theory).

  var newDoc;
  // Run this code up front so that it fails fast if someone uses
  // a Mongo update operator we don't support.
  if (isModify) {
    // We've already run replaceTypes/replaceMeteorAtomWithMongo on
    // selector and mod.  We assume it doesn't matter, as far as
    // the behavior of modifiers is concerned, whether `_modify`
    // is run on EJSON or on mongo-converted EJSON.
    var selectorDoc = LocalCollection._removeDollarOperators(selector);
    LocalCollection._modify(selectorDoc, mod, true);
    newDoc = selectorDoc;
  } else {
    newDoc = mod;
  }

  var insertedId = options.insertedId; // must exist
  var mongoOptsForUpdate = {
    safe: true,
    multi: options.multi
  };
  var mongoOptsForInsert = {
    safe: true,
    upsert: true
  };

  var tries = NUM_OPTIMISTIC_TRIES;

  var doUpdate = function () {
    tries--;
    if (! tries) {
      callback(new Error("Upsert failed after " + NUM_OPTIMISTIC_TRIES + " tries."));
    } else {
      collection.update(selector, mod, mongoOptsForUpdate,
                        bindEnvironmentForWrite(function (err, result) {
                          if (err)
                            callback(err);
                          else if (result)
                            callback(null, {
                              numberAffected: result
                            });
                          else
                            doConditionalInsert();
                        }));
    }
  };

  var doConditionalInsert = function () {
    var replacementWithId = _.extend(
      replaceTypes({_id: insertedId}, replaceMeteorAtomWithMongo),
      newDoc);
    collection.update(selector, replacementWithId, mongoOptsForInsert,
                      bindEnvironmentForWrite(function (err, result) {
                        if (err) {
                          // figure out if this is a
                          // "cannot change _id of document" error, and
                          // if so, try doUpdate() again, up to 3 times.
                          if (MongoConnection._isCannotChangeIdError(err)) {
                            doUpdate();
                          } else {
                            callback(err);
                          }
                        } else {
                          callback(null, {
                            numberAffected: result,
                            insertedId: insertedId
                          });
                        }
                      }));
  };

  doUpdate();
};

_.each(["insert", "update", "remove"], function (method) {
  MongoConnection.prototype[method] = function (/* arguments */) {
    var self = this;
    return Meteor._wrapAsync(self["_" + method]).apply(self, arguments);
  };
});

// XXX MongoConnection.upsert() does not return the id of the inserted document
// unless you set it explicitly in the selector or modifier (as a replacement
// doc).
MongoConnection.prototype.upsert = function (collectionName, selector, mod,
                                             options, callback) {
  var self = this;
  if (typeof options === "function" && ! callback) {
    callback = options;
    options = {};
  }

  return self.update(collectionName, selector, mod,
                     _.extend({}, options, {
                       upsert: true,
                       _returnObject: true
                     }), callback);
};

MongoConnection.prototype.find = function (collectionName, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  return new Cursor(
    self, new CursorDescription(collectionName, selector, options));
};

MongoConnection.prototype.findOne = function (collection_name, selector,
                                              options) {
  var self = this;
  if (arguments.length === 1)
    selector = {};

  options = options || {};
  options.limit = 1;
  return self.find(collection_name, selector, options).fetch()[0];
};

// We'll actually design an index API later. For now, we just pass through to
// Mongo's, but make it synchronous.
MongoConnection.prototype._ensureIndex = function (collectionName, index,
                                                   options) {
  var self = this;
  options = _.extend({safe: true}, options);

  // We expect this function to be called at startup, not from within a method,
  // so we don't interact with the write fence.
  var collection = self._getCollection(collectionName);
  var future = new Future;
  var indexName = collection.ensureIndex(index, options, future.resolver());
  future.wait();
};
MongoConnection.prototype._dropIndex = function (collectionName, index) {
  var self = this;

  // This function is only used by test code, not within a method, so we don't
  // interact with the write fence.
  var collection = self._getCollection(collectionName);
  var future = new Future;
  var indexName = collection.dropIndex(index, future.resolver());
  future.wait();
};

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
// documented Meteor.Collection cursor API.  It wraps a CursorDescription and a
// SynchronousCursor (lazily: it doesn't contact Mongo until you call a method
// like fetch or forEach on it).
//
// ObserveHandle is the "observe handle" returned from observeChanges. It has a
// reference to a LiveResultsSet.
//
// LiveResultsSet caches the results of a query and reruns it when necessary.
// It is hooked up to one or more ObserveHandles; a single LiveResultsSet
// can drive multiple sets of observation callbacks if they are for the
// same query.


var CursorDescription = function (collectionName, selector, options) {
  var self = this;
  self.collectionName = collectionName;
  self.selector = Meteor.Collection._rewriteSelector(selector);
  self.options = options || {};
};

Cursor = function (mongo, cursorDescription) {
  var self = this;

  self._mongo = mongo;
  self._cursorDescription = cursorDescription;
  self._synchronousCursor = null;
};

_.each(['forEach', 'map', 'rewind', 'fetch', 'count'], function (method) {
  Cursor.prototype[method] = function () {
    var self = this;

    // You can only observe a tailable cursor.
    if (self._cursorDescription.options.tailable)
      throw new Error("Cannot call " + method + " on a tailable cursor");

    if (!self._synchronousCursor) {
      self._synchronousCursor = self._mongo._createSynchronousCursor(
        self._cursorDescription, {
          // Make sure that the "self" argument to forEach/map callbacks is the
          // Cursor, not the SynchronousCursor.
          selfForIteration: self,
          useTransform: true
        });
    }

    return self._synchronousCursor[method].apply(
      self._synchronousCursor, arguments);
  };
});

Cursor.prototype.getTransform = function () {
  var self = this;
  return self._cursorDescription.options.transform;
};

// When you call Meteor.publish() with a function that returns a Cursor, we need
// to transmute it into the equivalent subscription.  This is the function that
// does that.

Cursor.prototype._publishCursor = function (sub) {
  var self = this;
  var collection = self._cursorDescription.collectionName;
  return Meteor.Collection._publishCursor(self, sub, collection);
};

// Used to guarantee that publish functions return at most one cursor per
// collection. Private, because we might later have cursors that include
// documents from multiple collections somehow.
Cursor.prototype._getCollectionName = function () {
  var self = this;
  return self._cursorDescription.collectionName;
}

Cursor.prototype.observe = function (callbacks) {
  var self = this;
  return LocalCollection._observeFromObserveChanges(self, callbacks);
};

Cursor.prototype.observeChanges = function (callbacks) {
  var self = this;
  var ordered = LocalCollection._isOrderedChanges(callbacks);
  return self._mongo._observeChanges(
    self._cursorDescription, ordered, callbacks);
};

MongoConnection.prototype._createSynchronousCursor = function(
    cursorDescription, options) {
  var self = this;
  options = _.pick(options || {}, 'selfForIteration', 'useTransform');

  var collection = self._getCollection(cursorDescription.collectionName);
  var cursorOptions = cursorDescription.options;
  var mongoOptions = {
    sort: cursorOptions.sort,
    limit: cursorOptions.limit,
    skip: cursorOptions.skip
  };

  // Do we want a tailable cursor (which only works on capped collections)?
  if (cursorOptions.tailable) {
    // We want a tailable cursor...
    mongoOptions.tailable = true;
    // ... and for the server to wait a bit if any getMore has no data (rather
    // than making us put the relevant sleeps in the client)...
    mongoOptions.awaitdata = true;
    // ... and to keep querying the server indefinitely rather than just 5 times
    // if there's no more data.
    mongoOptions.numberOfRetries = -1;
    // And if this cursor specifies a 'ts', then set the undocumented oplog
    // replay flag, which does a special scan to find the first document
    // (instead of creating an index on ts).
    if (cursorDescription.selector.ts)
      mongoOptions.oplogReplay = true;
  }

  var dbCursor = collection.find(
    replaceTypes(cursorDescription.selector, replaceMeteorAtomWithMongo),
    cursorOptions.fields, mongoOptions);

  return new SynchronousCursor(dbCursor, cursorDescription, options);
};

var SynchronousCursor = function (dbCursor, cursorDescription, options) {
  var self = this;
  options = _.pick(options || {}, 'selfForIteration', 'useTransform');

  self._dbCursor = dbCursor;
  self._cursorDescription = cursorDescription;
  // The "self" argument passed to forEach/map callbacks. If we're wrapped
  // inside a user-visible Cursor, we want to provide the outer cursor!
  self._selfForIteration = options.selfForIteration || self;
  if (options.useTransform && cursorDescription.options.transform) {
    self._transform = Deps._makeNonreactive(
      cursorDescription.options.transform
    );
  } else {
    self._transform = null;
  }

  // Need to specify that the callback is the first argument to nextObject,
  // since otherwise when we try to call it with no args the driver will
  // interpret "undefined" first arg as an options hash and crash.
  self._synchronousNextObject = Future.wrap(
    dbCursor.nextObject.bind(dbCursor), 0);
  self._synchronousCount = Future.wrap(dbCursor.count.bind(dbCursor));
  self._visitedIds = {};
};

_.extend(SynchronousCursor.prototype, {
  _nextObject: function () {
    var self = this;

    while (true) {
      var doc = self._synchronousNextObject().wait();

      if (!doc) return null;
      doc = replaceTypes(doc, replaceMongoAtomWithMeteor);

      if (!self._cursorDescription.options.tailable && _.has(doc, '_id')) {
        // Did Mongo give us duplicate documents in the same cursor? If so,
        // ignore this one. (Do this before the transform, since transform might
        // return some unrelated value.) We don't do this for tailable cursors,
        // because we want to maintain O(1) memory usage. And if there isn't _id
        // for some reason (maybe it's the oplog), then we don't do this either.
        // (Be careful to do this for falsey but existing _id, though.)
        var strId = LocalCollection._idStringify(doc._id);
        if (self._visitedIds[strId]) continue;
        self._visitedIds[strId] = true;
      }

      if (self._transform)
        doc = self._transform(doc);

      return doc;
    }
  },

  forEach: function (callback, thisArg) {
    var self = this;

    // We implement the loop ourself instead of using self._dbCursor.each,
    // because "each" will call its callback outside of a fiber which makes it
    // much more complex to make this function synchronous.
    var index = 0;
    while (true) {
      var doc = self._nextObject();
      if (!doc) return;
      callback.call(thisArg, doc, index++, self._selfForIteration);
    }
  },

  // XXX Allow overlapping callback executions if callback yields.
  map: function (callback, thisArg) {
    var self = this;
    var res = [];
    self.forEach(function (doc, index) {
      res.push(callback.call(thisArg, doc, index, self._selfForIteration));
    });
    return res;
  },

  rewind: function () {
    var self = this;

    // known to be synchronous
    self._dbCursor.rewind();

    self._visitedIds = {};
  },

  // Mostly usable for tailable cursors.
  close: function () {
    var self = this;

    self._dbCursor.close();
  },

  fetch: function () {
    var self = this;
    return self.map(_.identity);
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
      var results = {};
      self.forEach(function (doc) {
        results[doc._id] = doc;
      });
      return results;
    }
  }
});

MongoConnection.prototype.tail = function (cursorDescription, docCallback) {
  var self = this;
  if (!cursorDescription.options.tailable)
    throw new Error("Can only tail a tailable cursor");

  var cursor = self._createSynchronousCursor(cursorDescription);

  var stopped = false;
  var lastTS = undefined;
  Meteor.defer(function () {
    while (true) {
      if (stopped)
        return;
      try {
        var doc = cursor._nextObject();
      } catch (err) {
        // There's no good way to figure out if this was actually an error
        // from Mongo. Ah well. But either way, we need to retry the cursor
        // (unless the failure was because the observe got stopped).
        doc = null;
      }
      // Since cursor._nextObject can yield, we need to check again to see if
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
        var newSelector = _.clone(cursorDescription.selector);
        if (lastTS) {
          newSelector.ts = {$gt: lastTS};
        }
        // XXX maybe set replay flag
        cursor = self._createSynchronousCursor(new CursorDescription(
          cursorDescription.collectionName,
          newSelector,
          cursorDescription.options));
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

var nextObserveHandleId = 1;
var ObserveHandle = function (liveResultsSet, callbacks) {
  var self = this;
  self._liveResultsSet = liveResultsSet;
  self._added = callbacks.added;
  self._addedBefore = callbacks.addedBefore;
  self._changed = callbacks.changed;
  self._removed = callbacks.removed;
  self._moved = callbacks.moved;
  self._movedBefore = callbacks.movedBefore;
  self._observeHandleId = nextObserveHandleId++;
};
ObserveHandle.prototype.stop = function () {
  var self = this;
  self._liveResultsSet._removeObserveHandle(self);
  self._liveResultsSet = null;
};

MongoConnection.prototype._observeChanges = function (
    cursorDescription, ordered, callbacks) {
  var self = this;

  if (cursorDescription.options.tailable) {
    return self._observeChangesTailable(cursorDescription, ordered, callbacks);
  }

  // XXX maybe this should actually use deduping too?
  if (self._oplogHandle && !ordered && !callbacks._testOnlyPollCallback
      // XXX remove this when oplog does de-duping
      && !cursorDescription.options._dontUseOplog
      && cursorSupportedByOplogTailing(cursorDescription)) {
    return self._observeChangesWithOplog(cursorDescription, callbacks);
  }

  var observeKey = JSON.stringify(
    _.extend({ordered: ordered}, cursorDescription));

  var liveResultsSet;
  var observeHandle;
  var newlyCreated = false;

  // Find a matching LiveResultsSet, or create a new one. This next block is
  // guaranteed to not yield (and it doesn't call anything that can observe a
  // new query), so no other calls to this function can interleave with it.
  Meteor._noYieldsAllowed(function () {
    if (_.has(self._liveResultsSets, observeKey)) {
      liveResultsSet = self._liveResultsSets[observeKey];
    } else {
      // Create a new LiveResultsSet. It is created "locked": no polling can
      // take place.
      liveResultsSet = new LiveResultsSet(
        cursorDescription,
        self,
        ordered,
        function () {
          delete self._liveResultsSets[observeKey];
        },
        callbacks._testOnlyPollCallback);
      self._liveResultsSets[observeKey] = liveResultsSet;
      newlyCreated = true;
    }
    observeHandle = new ObserveHandle(liveResultsSet, callbacks);
  });

  if (newlyCreated) {
    // This is the first ObserveHandle on this LiveResultsSet.  Add it and run
    // the initial synchronous poll (which may yield).
    liveResultsSet._addFirstObserveHandle(observeHandle);
  } else {
    // Not the first ObserveHandle. Add it to the LiveResultsSet. This call
    // yields until we're not in the middle of a poll, and its invocation of the
    // initial 'added' callbacks may yield as well. It blocks until the 'added'
    // callbacks have fired.
    liveResultsSet._addObserveHandleAndSendInitialAdds(observeHandle);
  }

  return observeHandle;
};

// Listen for the invalidation messages that will trigger us to poll the
// database for changes. If this selector specifies specific IDs, specify them
// here, so that updates to different specific IDs don't cause us to poll.
// listenCallback is the same kind of (notification, complete) callback passed
// to InvalidationCrossbar.listen.
listenAll = function (cursorDescription, listenCallback) {
  var listeners = [];
  var listenOnTrigger = function (trigger) {
    listeners.push(DDPServer._InvalidationCrossbar.listen(
      trigger, listenCallback));
  };

  var key = {collection: cursorDescription.collectionName};
  var specificIds = LocalCollection._idsMatchedBySelector(
    cursorDescription.selector);
  if (specificIds) {
    _.each(specificIds, function (id) {
      listenOnTrigger(_.extend({id: id}, key));
    });
  } else {
    listenOnTrigger(key);
  }

  return {
    stop: function () {
      _.each(listeners, function (listener) {
        listener.stop();
      });
    }
  };
};

var LiveResultsSet = function (cursorDescription, mongoHandle, ordered,
                               stopCallback, testOnlyPollCallback) {
  var self = this;

  self._cursorDescription = cursorDescription;
  self._mongoHandle = mongoHandle;
  self._ordered = ordered;
  self._stopCallbacks = [stopCallback];

  // This constructor cannot yield, so we don't create the synchronousCursor yet
  // (since that can yield).
  self._synchronousCursor = null;

  // previous results snapshot.  on each poll cycle, diffs against
  // results drives the callbacks.
  self._results = ordered ? [] : {};

  // The number of _pollMongo calls that have been added to self._taskQueue but
  // have not started running. Used to make sure we never schedule more than one
  // _pollMongo (other than possibly the one that is currently running). It's
  // also used by _suspendPolling to pretend there's a poll scheduled. Usually,
  // it's either 0 (for "no polls scheduled other than maybe one currently
  // running") or 1 (for "a poll scheduled that isn't running yet"), but it can
  // also be 2 if incremented by _suspendPolling.
  self._pollsScheduledButNotStarted = 0;
  // Number of _addObserveHandleAndSendInitialAdds tasks scheduled but not yet
  // running. _removeObserveHandle uses this to know if it's safe to shut down
  // this LiveResultsSet.
  self._addHandleTasksScheduledButNotPerformed = 0;
  self._pendingWrites = []; // people to notify when polling completes

  // Make sure to create a separately throttled function for each LiveResultsSet
  // object.
  self._ensurePollIsScheduled = _.throttle(
    self._unthrottledEnsurePollIsScheduled, 50 /* ms */);

  self._taskQueue = new Meteor._SynchronousQueue();

  var listenersHandle = listenAll(
    cursorDescription, function (notification, complete) {
      // When someone does a transaction that might affect us, schedule a poll
      // of the database. If that transaction happens inside of a write fence,
      // block the fence until we've polled and notified observers.
      var fence = DDPServer._CurrentWriteFence.get();
      if (fence)
        self._pendingWrites.push(fence.beginWrite());
      // Ensure a poll is scheduled... but if we already know that one is,
      // don't hit the throttled _ensurePollIsScheduled function (which might
      // lead to us calling it unnecessarily in 50ms).
      if (self._pollsScheduledButNotStarted === 0)
        self._ensurePollIsScheduled();
      complete();
    }
  );
  self._stopCallbacks.push(function () { listenersHandle.stop(); });

  // Map from handle ID to ObserveHandle.
  self._observeHandles = {};

  self._callbackMultiplexer = {};
  var callbackNames = ['added', 'changed', 'removed'];
  if (self._ordered) {
    callbackNames.push('moved');
    callbackNames.push('addedBefore');
    callbackNames.push('movedBefore');
  }
  _.each(callbackNames, function (callback) {
    var handleCallback = '_' + callback;
    self._callbackMultiplexer[callback] = function () {
      var args = _.toArray(arguments);
      // Because callbacks can yield and _removeObserveHandle() (ie,
      // handle.stop()) doesn't synchronize its actions with _taskQueue,
      // ObserveHandles can disappear from self._observeHandles during this
      // dispatch. Thus, we save a copy of the keys of self._observeHandles
      // before we start to iterate, and we check to see if the handle is still
      // there each time.
      _.each(_.keys(self._observeHandles), function (handleId) {
        var handle = self._observeHandles[handleId];
        if (handle && handle[handleCallback])
          handle[handleCallback].apply(null, EJSON.clone(args));
      });
    };
  });

  // every once and a while, poll even if we don't think we're dirty, for
  // eventual consistency with database writes from outside the Meteor
  // universe.
  //
  // For testing, there's an undocumented callback argument to observeChanges
  // which disables time-based polling and gets called at the beginning of each
  // poll.
  if (testOnlyPollCallback) {
    self._testOnlyPollCallback = testOnlyPollCallback;
  } else {
    var intervalHandle = Meteor.setInterval(
      _.bind(self._ensurePollIsScheduled, self), 10 * 1000);
    self._stopCallbacks.push(function () {
      Meteor.clearInterval(intervalHandle);
    });
  }

  Package.facts && Package.facts.Facts.incrementServerFact(
    "mongo-livedata", "live-results-sets", 1);
};

_.extend(LiveResultsSet.prototype, {
  _addFirstObserveHandle: function (handle) {
    var self = this;
    if (! _.isEmpty(self._observeHandles))
      throw new Error("Not the first observe handle!");
    if (! _.isEmpty(self._results))
      throw new Error("Call _addFirstObserveHandle before polling!");

    self._observeHandles[handle._observeHandleId] = handle;
    Package.facts && Package.facts.Facts.incrementServerFact(
      "mongo-livedata", "observe-handles", 1);

    // Run the first _poll() cycle synchronously (delivering results to the
    // first ObserveHandle).
    ++self._pollsScheduledButNotStarted;
    self._taskQueue.runTask(function () {
      self._pollMongo();
    });
  },

  // This is always called through _.throttle.
  _unthrottledEnsurePollIsScheduled: function () {
    var self = this;
    if (self._pollsScheduledButNotStarted > 0)
      return;
    ++self._pollsScheduledButNotStarted;
    self._taskQueue.queueTask(function () {
      self._pollMongo();
    });
  },

  // test-only interface for controlling polling.
  //
  // _suspendPolling blocks until any currently running and scheduled polls are
  // done, and prevents any further polls from being scheduled. (new
  // ObserveHandles can be added and receive their initial added callbacks,
  // though.)
  //
  // _resumePolling immediately polls, and allows further polls to occur.
  _suspendPolling: function() {
    var self = this;
    // Pretend that there's another poll scheduled (which will prevent
    // _ensurePollIsScheduled from queueing any more polls).
    ++self._pollsScheduledButNotStarted;
    // Now block until all currently running or scheduled polls are done.
    self._taskQueue.runTask(function() {});

    // Confirm that there is only one "poll" (the fake one we're pretending to
    // have) scheduled.
    if (self._pollsScheduledButNotStarted !== 1)
      throw new Error("_pollsScheduledButNotStarted is " +
                      self._pollsScheduledButNotStarted);
  },
  _resumePolling: function() {
    var self = this;
    // We should be in the same state as in the end of _suspendPolling.
    if (self._pollsScheduledButNotStarted !== 1)
      throw new Error("_pollsScheduledButNotStarted is " +
                      self._pollsScheduledButNotStarted);
    // Run a poll synchronously (which will counteract the
    // ++_pollsScheduledButNotStarted from _suspendPolling).
    self._taskQueue.runTask(function () {
      self._pollMongo();
    });
  },

  _pollMongo: function () {
    var self = this;
    --self._pollsScheduledButNotStarted;

    self._testOnlyPollCallback && self._testOnlyPollCallback();

    // Save the list of pending writes which this round will commit.
    var writesForCycle = self._pendingWrites;
    self._pendingWrites = [];

    // Get the new query results. (These calls can yield.)
    if (self._synchronousCursor) {
      self._synchronousCursor.rewind();
    } else {
      self._synchronousCursor = self._mongoHandle._createSynchronousCursor(
        self._cursorDescription);
    }
    var newResults = self._synchronousCursor.getRawObjects(self._ordered);
    var oldResults = self._results;

    // Run diffs. (This can yield too.)
    if (!_.isEmpty(self._observeHandles)) {
      LocalCollection._diffQueryChanges(
        self._ordered, oldResults, newResults, self._callbackMultiplexer);
    }

    // Replace self._results atomically.
    self._results = newResults;

    // Mark all the writes which existed before this call as commmitted. (If new
    // writes have shown up in the meantime, there'll already be another
    // _pollMongo task scheduled.)
    _.each(writesForCycle, function (w) {w.committed();});
  },

  // Adds the observe handle to this set and sends its initial added
  // callbacks. Meteor._SynchronousQueue guarantees that this won't interleave
  // with a call to _pollMongo or another call to this function.
  _addObserveHandleAndSendInitialAdds: function (handle) {
    var self = this;

    // Check this before calling runTask (even though runTask does the same
    // check) so that we don't leak a LiveResultsSet by incrementing
    // _addHandleTasksScheduledButNotPerformed and never decrementing it.
    if (!self._taskQueue.safeToRunTask())
      throw new Error(
        "Can't call observe() from an observe callback on the same query");

    // Keep track of how many of these tasks are on the queue, so that
    // _removeObserveHandle knows if it's safe to GC.
    ++self._addHandleTasksScheduledButNotPerformed;

    self._taskQueue.runTask(function () {
      if (!self._observeHandles)
        throw new Error("Can't add observe handle to stopped LiveResultsSet");

      if (_.has(self._observeHandles, handle._observeHandleId))
        throw new Error("Duplicate observe handle ID");
      self._observeHandles[handle._observeHandleId] = handle;
      --self._addHandleTasksScheduledButNotPerformed;
      Package.facts && Package.facts.Facts.incrementServerFact(
        "mongo-livedata", "observe-handles", 1);

      // Send initial adds.
      if (handle._added || handle._addedBefore) {
        _.each(self._results, function (doc, i) {
          var fields = EJSON.clone(doc);
          delete fields._id;
          if (self._ordered) {
            handle._added && handle._added(doc._id, fields);
            handle._addedBefore && handle._addedBefore(doc._id, fields, null);
          } else {
            handle._added(doc._id, fields);
          }
        });
      }
    });
  },

  // Remove an observe handle. If it was the last observe handle, call all the
  // stop callbacks; you cannot add any more observe handles after this.
  //
  // This is not synchronized with polls and handle additions: this means that
  // you can safely call it from within an observe callback.
  _removeObserveHandle: function (handle) {
    var self = this;

    if (!_.has(self._observeHandles, handle._observeHandleId))
      throw new Error("Unknown observe handle ID " + handle._observeHandleId);
    delete self._observeHandles[handle._observeHandleId];
    Package.facts && Package.facts.Facts.incrementServerFact(
      "mongo-livedata", "observe-handles", -1);

    if (_.isEmpty(self._observeHandles) &&
        self._addHandleTasksScheduledButNotPerformed === 0) {
      // The last observe handle was stopped; call our stop callbacks, which:
      //  - removes us from the MongoConnection's _liveResultsSets map
      //  - stops the poll timer
      //  - removes us from the invalidation crossbar
      _.each(self._stopCallbacks, function (c) { c(); });
      Package.facts && Package.facts.Facts.incrementServerFact(
        "mongo-livedata", "live-results-sets", -1);
      // This will cause future _addObserveHandleAndSendInitialAdds calls to
      // throw.
      self._observeHandles = null;
    }
  }
});

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

// Does our oplog tailing code support this cursor? For now, we are being very
// conservative and allowing only simple queries with simple options.
var cursorSupportedByOplogTailing = function (cursorDescription) {
  // First, check the options.
  var options = cursorDescription.options;

  // We don't yet implement field filtering for oplog tailing (just because it's
  // not implemented, not because there's a deep problem with implementing it).
  // XXX Implementing field filtering should be a priority.
  if (options.fields) return false;

  // This option (which are mostly used for sorted cursors) require us to figure
  // out where a given document fits in an order to know if it's included or
  // not, and we don't track that information when doing oplog tailing.
  if (options.limit || options.skip) return false;

  // For now, we're just dealing with equality queries: no $operators, regexps,
  // or $and/$or/$where/etc clauses. We can expand the scope of what we're
  // comfortable processing later. ($where will get pretty scary since it will
  // allow selector processing to yield!)
  return _.all(cursorDescription.selector, function (value, field) {
    // No logical operators like $and.
    if (field.substr(0, 1) === '$')
      return false;
    // We only allow scalars, not sub-documents or $operators or RegExp.
    // XXX Date would be easy too, though I doubt anyone is doing equality
    // lookups on dates
    return typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null ||
      value instanceof Meteor.Collection.ObjectID;
  });
};



// XXX We probably need to find a better way to expose this. Right now
// it's only used by tests, but in fact you need it in normal
// operation to interact with capped collections (eg, Galaxy uses it).
MongoInternals.MongoTimestamp = MongoDB.Timestamp;

MongoInternals.Connection = MongoConnection;
MongoInternals.NpmModule = MongoDB;

MongoTest = {
  cursorSupportedByOplogTailing: cursorSupportedByOplogTailing,
  DocFetcher: DocFetcher
};
