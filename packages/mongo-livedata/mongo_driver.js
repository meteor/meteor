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

  MongoDB.connect(url, function(err, db) {
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
// _Mongo.LiveResultsSet is the "observe handle" returned from observe and
// _observeUnordered. It caches the results of a query and reruns it when
// necessary.


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

_Mongo.prototype._observe = function (cursorDescription, ordered, callbacks) {
  var self = this;
  return new _Mongo.LiveResultsSet(
    cursorDescription,
    self._createSynchronousCursor(cursorDescription),
    ordered,
    callbacks);
};

_Mongo.LiveResultsSet = function (cursorDescription, synchronousCursor, ordered,
                                  callbacks) {
  var self = this;

  self._cursorDescription = cursorDescription;
  self._synchronousCursor = synchronousCursor;

  self._ordered = ordered;

  // previous results snapshot.  on each poll cycle, diffs against
  // results drives the callbacks.
  self._results = ordered ? [] : {};

  // state for polling
  self._dirty = false; // do we need polling?
  self._pendingWrites = []; // people to notify when polling completes
  self._pollRunning = false; // is polling in progress now?
  self._pollingSuspended = false; // is polling temporarily suspended?

  // (each instance of the class needs to get a separate throttling
  // context -- we don't want to coalesce invocations of markDirty on
  // different instances!)
  self._markDirty = _.throttle(self._unthrottledMarkDirty, 50 /* ms */);

  // listen for the invalidation messages that will trigger us to poll
  // the database for changes
  var keys = (cursorDescription.options.key ||
              {collection: cursorDescription.collectionName});
  if (!(keys instanceof Array))
    keys = [keys];
  self._crossbarListeners = _.map(keys, function (key) {
    return Meteor._InvalidationCrossbar.listen(key, function (notification,
                                                              complete) {
      // When someone does a transaction that might affect us,
      // schedule a poll of the database. If that transaction happens
      // inside of a write fence, block the fence until we've polled
      // and notified observers.
      var fence = Meteor._CurrentWriteFence.get();
      if (fence)
        self._pendingWrites.push(fence.beginWrite());
      self._markDirty();
      complete();
    });
  });

  // user callbacks
  self._callbacks = callbacks;

  // run the first _poll() cycle synchronously.
  self._pollRunning = true;
  self._doPoll();
  self._pollRunning = false;

  // every once and a while, poll even if we don't think we're dirty,
  // for eventual consistency with database writes from outside the
  // Meteor universe
  self._refreshTimer = Meteor.setInterval(_.bind(self._markDirty, this),
                                          10 * 1000 /* 10 seconds */);
};

_Mongo.LiveResultsSet.prototype._unthrottledMarkDirty = function () {
  var self = this;

  self._dirty = true;
  if (self._pollingSuspended)
    return; // don't poll when told not to
  if (self._pollRunning)
    return; // only one instance can run at once. just tell it to re-cycle.
  self._pollRunning = true;

  Fiber(function () {
    self._dirty = false;
    var writesForCycle = self._pendingWrites;
    self._pendingWrites = [];
    self._doPoll(); // could yield, and set self._dirty
    _.each(writesForCycle, function (w) {w.committed();});

    self._pollRunning = false;
    if (self._dirty || self._pendingWrites.length)
      // rerun ourselves, but through _.throttle
      self._markDirty();
  }).run();
};

// interface for tests to control when polling happens
_Mongo.LiveResultsSet.prototype._suspendPolling = function() {
  this._pollingSuspended = true;
};
_Mongo.LiveResultsSet.prototype._resumePolling = function() {
  this._pollingSuspended = false;
  this._unthrottledMarkDirty(); // poll NOW, don't wait
};


_Mongo.LiveResultsSet.prototype._doPoll = function () {
  var self = this;

  // Get the new query results
  self._synchronousCursor.rewind();
  var new_results = self._synchronousCursor.getRawObjects(self._ordered);
  var old_results = self._results;

  LocalCollection._diffQuery(
    self._ordered, old_results, new_results, self._callbacks, true);
  self._results = new_results;
};

_Mongo.LiveResultsSet.prototype.stop = function () {
  var self = this;
  _.each(self._crossbarListeners, function (l) { l.stop(); });
  Meteor.clearInterval(self._refreshTimer);
};

_.extend(Meteor, {
  _Mongo: _Mongo
});
})();
