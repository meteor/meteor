(function(){
/**
 * Provide a synchronous Collection API using fibers, backed by
 * MongoDB.  This is only for use on the server, and mostly identical
 * to the client API.
 *
 * NOTE: the public API methods must be run within a fiber. If you call
 * these outside of a fiber they will explode!
 */

var path = __meteor_bootstrap__.require('path');
var MongoDB = __meteor_bootstrap__.require('mongodb');
var Future = __meteor_bootstrap__.require(path.join('fibers', 'future'));

_Mongo = function (url) {
  var self = this;

  self.collection_queue = [];

  self._liveResultsSets = {};

  MongoDB.connect(url, {db: {safe: true}}, function(err, db) {
    if (err)
      throw err;
    self.db = db;

    // drain queue of pending callbacks
    var c;
    while ((c = self.collection_queue.pop())) {
      Fiber(function () {
        db.collection(c.name, c.callback);
      }).run();
    }
  });
};

// protect against dangerous selectors.  falsey and {_id: falsey}
// are both likely programmer error, and not what you want,
// particularly for destructive operations.
_Mongo._rewriteSelector = function (selector) {
  // shorthand -- scalars match _id
  if ((typeof selector === 'string') || (typeof selector === 'number'))
    selector = {_id: selector};

  if (!selector || (('_id' in selector) && !selector._id))
    // can't match anything
    return {_id: Meteor.uuid()};
  else
    return selector;
};

// callback: lambda (err, collection) called when
// collection is ready to go, or on error.
_Mongo.prototype._withCollection = function(collection_name, callback) {
  var self = this;

  if (self.db) {
    self.db.collection(collection_name, callback);
  } else {
    self.collection_queue.push({name: collection_name, callback: callback});
  }
};

// This should be called synchronously with a write, to create a
// transaction on the current write fence, if any. After we can read
// the write, and after observers have been notified (or at least,
// after the observer notifiers have added themselves to the write
// fence), you should call 'committed()' on the object returned.
_Mongo.prototype._maybeBeginWrite = function () {
  var self = this;
  var fence = Meteor._CurrentWriteFence.get();
  if (fence)
    return fence.beginWrite();
  else
    return {committed: function () {}};
};

//////////// Public API //////////

// The write methods block until the database has confirmed the write
// (it may not be replicated or stable on disk, but one server has
// confirmed it.) (In the future we might have an option to turn this
// off, ie, to enqueue the request on the wire and return
// immediately.)  They return nothing on success, and raise an
// exception on failure.
//
// After making a write (with insert, update, remove), observers are
// notified asynchronously. If you want to receive a callback once all
// of the observer notifications have landed for your write, do the
// writes inside a write fence (set Meteor._CurrentWriteFence to a new
// _WriteFence, and then set a callback on the write fence.)
//
// Since our execution environment is single-threaded, this is
// well-defined -- a write "has been made" if it's returned, and an
// observer "has been notified" if its callback has returned.

_Mongo.prototype.insert = function (collection_name, document) {
  var self = this;

  if (collection_name === "___meteor_failure_test_collection" &&
      document.fail) {
    var e = new Error("Failure test");
    e.expected = true;
    throw e;
  }

  var write = self._maybeBeginWrite();

  var future = new Future;
  self._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret(err);
      return;
    }

    collection.insert(document, {safe: true}, function (err) {
      future.ret(err);
    });
  });

  var err = future.wait();
  Meteor.refresh({collection: collection_name});
  write.committed();
  if (err)
    throw err;
};

_Mongo.prototype.remove = function (collection_name, selector) {
  var self = this;

  if (collection_name === "___meteor_failure_test_collection" &&
      selector.fail) {
    var e = new Error("Failure test");
    e.expected = true;
    throw e;
  }

  var write = self._maybeBeginWrite();

  // XXX does not allow options. matches the client.
  selector = _Mongo._rewriteSelector(selector);

  var future = new Future;
  self._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret(err);
      return;
    }

    collection.remove(selector, {safe: true}, function (err) {
      future.ret(err);
    });
  });

  var err = future.wait();
  Meteor.refresh({collection: collection_name});
  write.committed();
  if (err)
    throw err;
};

_Mongo.prototype.update = function (collection_name, selector, mod, options) {
  var self = this;

  if (collection_name === "___meteor_failure_test_collection" &&
      selector.fail) {
    var e = new Error("Failure test");
    e.expected = true;
    throw e;
  }

  var write = self._maybeBeginWrite();

  selector = _Mongo._rewriteSelector(selector);
  if (!options) options = {};

  var future = new Future;
  self._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret(err);
      return;
    }

    var opts = {safe: true};
    // explictly enumerate options that minimongo supports
    if (options.upsert) opts.upsert = true;
    if (options.multi) opts.multi = true;

    collection.update(selector, mod, opts, function (err) {
      future.ret(err);
    });
  });

  var err = future.wait();
  Meteor.refresh({collection: collection_name});
  write.committed();
  if (err)
    throw err;
};

_Mongo.prototype.find = function (collectionName, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  return new Cursor(
    self, new CursorDescription(collectionName, selector, options));
};

_Mongo.prototype.findOne = function (collection_name, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  // XXX use limit=1 instead?
  return self.find(collection_name, selector, options).fetch()[0];
};

// We'll actually design an index API later. For now, we just pass through to
// Mongo's, but make it synchronous.
_Mongo.prototype._ensureIndex = function (collectionName, index, options) {
  var self = this;
  options = _.extend({safe: true}, options);

  // We expect this function to be called at startup, not from within a method,
  // so we don't interact with the write fence.
  var future = new Future;
  self._withCollection(collectionName, function (err, collection) {
    if (err) {
      future.throw(err);
      return;
    }
    // XXX do we have to bindEnv or Fiber.run this callback?
    collection.ensureIndex(index, options, function (err, indexName) {
      if (err) {
        future.throw(err);
        return;
      }
      future.ret();
    });
  });
  future.wait();
};

// CURSORS

// There are several classes which relate to cursors:
//
// CursorDescription represents the arguments used
// to construct a cursor: collectionName, selector, and (find) options.
//
// SynchronousCursor is a wrapper around a MongoDB cursor
// which includes fully-synchronous versions of forEach, etc.
//
// Cursor is the cursor object returned from find(), which implements the
// documented Meteor.Collection cursor API.  It wraps a CursorDescription and a
// SynchronousCursor (lazily: it doesn't contact Mongo until you call a method
// like fetch or forEach on it).
//
// ObserveHandle is the "observe handle" returned from observe and
// _observeUnordered. It has a reference to a LiveResultsSet.
//
// LiveResultsSet caches the results of a query and reruns it when necessary.
// It is hooked up to one or more ObserveHandles; a single LiveResultsSet
// can drive multiple sets of observation callbacks if they are for the
// same query.


var CursorDescription = function (collectionName, selector, options) {
  var self = this;
  self.collectionName = collectionName;
  self.selector = _Mongo._rewriteSelector(selector);
  self.options = options || {};
};

var Cursor = function (mongo, cursorDescription) {
  var self = this;

  self._mongo = mongo;
  self._cursorDescription = cursorDescription;
  self._synchronousCursor = null;
};

_.each(['forEach', 'map', 'rewind', 'fetch', 'count'], function (method) {
  Cursor.prototype[method] = function () {
    var self = this;

    if (!self._synchronousCursor)
      self._synchronousCursor = self._mongo._createSynchronousCursor(
        self._cursorDescription);

    return self._synchronousCursor[method].apply(
      self._synchronousCursor, arguments);
  };
});

// Called by livedata_server to automatically publish cursors returned from a
// publish handler over DDP.
Cursor.prototype._publishCursor = function (sub) {
  var self = this;
  var collection = self._cursorDescription.collectionName;

  var observeHandle = self._observeUnordered({
    added: function (obj) {
      sub.set(collection, obj._id, obj);
      sub.flush();
    },
    changed: function (obj, oldObj) {
      var set = {};
      _.each(obj, function (v, k) {
        if (!_.isEqual(v, oldObj[k]))
          set[k] = v;
      });
      sub.set(collection, obj._id, set);
      var deadKeys = _.difference(_.keys(oldObj), _.keys(obj));
      sub.unset(collection, obj._id, deadKeys);
      sub.flush();
    },
    removed: function (oldObj) {
      sub.unset(collection, oldObj._id, _.keys(oldObj));
      sub.flush();
    }
  });

  // _observeUnordered only returns after the initial added callbacks have run.
  // mark subscription as completed.
  sub.complete();
  sub.flush();

  // register stop callback (expects lambda w/ no args).
  sub.onStop(function () {observeHandle.stop();});
};

Cursor.prototype.observe = function (callbacks) {
  var self = this;
  return self._mongo._observe(
    self._cursorDescription, true, callbacks);
};

Cursor.prototype._observeUnordered = function (callbacks) {
  var self = this;
  return self._mongo._observe(
    self._cursorDescription, false, callbacks);
};

_Mongo.prototype._createSynchronousCursor = function (cursorDescription) {
  var self = this;

  var future = new Future;
  self._withCollection(
    cursorDescription.collectionName, function (err, collection) {
      if (err) {
        future.ret([false, err]);
        return;
      }
      var options = cursorDescription.options;
      var dbCursor = collection.find(
        cursorDescription.selector,
        options.fields, {
          sort: options.sort,
          limit: options.limit,
          skip: options.skip
        });
      future.ret([true, dbCursor]);
    });

  var result = future.wait();
  if (!result[0])
    throw result[1];

  return new SynchronousCursor(result[1]);
};

var SynchronousCursor = function (dbCursor) {
  var self = this;
  self._dbCursor = dbCursor;
  self._synchronousNextObject = Future.wrap(dbCursor.nextObject.bind(dbCursor));
  self._synchronousCount = Future.wrap(dbCursor.count.bind(dbCursor));
  self._visitedIds = {};
};

_.extend(SynchronousCursor.prototype, {
  _nextObject: function () {
    var self = this;
    while (true) {
      var doc = self._synchronousNextObject().wait();
      if (!doc || !doc._id) return null;
      if (self._visitedIds[doc._id]) continue;
      self._visitedIds[doc._id] = true;
      return doc;
    }
  },

  // XXX Make more like ECMA forEach:
  //     https://github.com/meteor/meteor/pull/63#issuecomment-5320050
  forEach: function (callback) {
    var self = this;

    // We implement the loop ourself instead of using self._dbCursor.each,
    // because "each" will call its callback outside of a fiber which makes it
    // much more complex to make this function synchronous.
    while (true) {
      var doc = self._nextObject();
      if (!doc) return;
      callback(doc);
    }
  },

  // XXX Make more like ECMA map:
  //     https://github.com/meteor/meteor/pull/63#issuecomment-5320050
  // XXX Allow overlapping callback executions if callback yields.
  map: function (callback) {
    var self = this;
    var res = [];
    self.forEach(function (doc) {
      res.push(callback(doc));
    });
    return res;
  },

  rewind: function () {
    var self = this;

    // known to be synchronous
    self._dbCursor.rewind();

    self._visitedIds = {};
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

var nextObserveHandleId = 1;
var ObserveHandle = function (liveResultsSet, callbacks) {
  var self = this;
  self._liveResultsSet = liveResultsSet;
  self._added = callbacks.added;
  self._changed = callbacks.changed;
  self._removed = callbacks.removed;
  self._moved = callbacks.moved;
  self._observeHandleId = nextObserveHandleId++;
};
ObserveHandle.prototype.stop = function () {
  var self = this;
  self._liveResultsSet._removeObserveHandle(self);
  self._liveResultsSet = null;
};

_Mongo.prototype._observe = function (cursorDescription, ordered, callbacks) {
  var self = this;
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
        self._createSynchronousCursor(cursorDescription),
        ordered,
        function () {
          delete self._liveResultsSets[observeKey];
        });
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

var LiveResultsSet = function (cursorDescription, synchronousCursor, ordered,
                               stopCallback) {
  var self = this;

  self._cursorDescription = cursorDescription;
  self._synchronousCursor = synchronousCursor;
  self._ordered = ordered;
  self._stopCallbacks = [stopCallback];

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

  // listen for the invalidation messages that will trigger us to poll the
  // database for changes
  var keys = (cursorDescription.options.key ||
              {collection: cursorDescription.collectionName});
  if (!(keys instanceof Array))
    keys = [keys];
  _.each(keys, function (key) {
    var listener = Meteor._InvalidationCrossbar.listen(
      key, function (notification, complete) {
        // When someone does a transaction that might affect us, schedule a poll
        // of the database. If that transaction happens inside of a write fence,
        // block the fence until we've polled and notified observers.
        var fence = Meteor._CurrentWriteFence.get();
        if (fence)
          self._pendingWrites.push(fence.beginWrite());
        self._ensurePollIsScheduled();
        complete();
      });
    self._stopCallbacks.push(function () { listener.stop(); });
  });

  // Map from handle ID to ObserveHandle.
  self._observeHandles = {};

  self._callbackMultiplexer = {};
  var callbackNames = ['added', 'changed', 'removed'];
  if (self._ordered)
    callbackNames.push('moved');
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
          handle[handleCallback].apply(null, args);
      });
    };
  });

  // every once and a while, poll even if we don't think we're dirty,
  // for eventual consistency with database writes from outside the
  // Meteor universe
  var intervalHandle = Meteor.setInterval(
    _.bind(self._ensurePollIsScheduled, self), 10 * 1000 /* 10 seconds */);
  self._stopCallbacks.push(function () {
    Meteor.clearInterval(intervalHandle);
  });
};

_.extend(LiveResultsSet.prototype, {
  _addFirstObserveHandle: function (handle) {
    var self = this;
    if (! _.isEmpty(self._observeHandles))
      throw new Error("Not the first observe handle!");
    if (! _.isEmpty(self._results))
      throw new Error("Call _addFirstObserveHandle before polling!");

    self._observeHandles[handle._observeHandleId] = handle;

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

    // Save the list of pending writes which this round will commit.
    var writesForCycle = self._pendingWrites;
    self._pendingWrites = [];

    // Get the new query results. (These calls can yield.)
    self._synchronousCursor.rewind();
    var newResults = self._synchronousCursor.getRawObjects(self._ordered);
    var oldResults = self._results;

    // Run diffs. (This can yield too.)
    if (!_.isEmpty(self._observeHandles))
      LocalCollection._diffQuery(
        self._ordered, oldResults, newResults, self._callbackMultiplexer, true);

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

      // Send initial adds.
      _.each(self._results, function (doc, i) {
        handle._added(LocalCollection._deepcopy(doc),
                      self._ordered ? i : undefined);
      });
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

    if (_.isEmpty(self._observeHandles) &&
        self._addHandleTasksScheduledButNotPerformed === 0) {
      // The last observe handle was stopped; call our stop callbacks, which:
      //  - removes us from the _Mongo's _liveResultsSets map
      //  - stops the poll timer
      //  - removes us from the invalidation crossbar
      _.each(self._stopCallbacks, function (c) { c(); });
      // This will cause future _addObserveHandleAndSendInitialAdds calls to
      // throw.
      self._observeHandles = null;
    }
  }
});

_.extend(Meteor, {
  _Mongo: _Mongo
});
})();
