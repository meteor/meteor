/**
 * Provide a synchronous Collection API using fibers, backed by
 * MongoDB.  This is only for use on the server, and mostly identical
 * to the client API.
 *
 * NOTE: the public API methods must be run within a fiber. If you call
 * these outside of a fiber they will explode!
 */

var MongoDB = __meteor_bootstrap__.require('mongodb');
var Future = __meteor_bootstrap__.require('fibers/future');

// js2-mode AST blows up when parsing 'future.return()', so alias.
Future.prototype.ret = Future.prototype.return;

_Mongo = function (url) {
  var self = this;

  self.collection_queue = [];

  MongoDB.connect(url, function(err, db) {
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

  var finish = Meteor.bindEnvironment(function () {
    Meteor.refresh({collection: collection_name});
    write.committed();
  }, function (e) {
    Meteor._debug("Exception while completing insert: " + e.stack);
  });

  var future = new Future;
  self._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret(err);
      return;
    }

    collection.insert(document, {safe: true}, function (err) {
      if (err) {
        future.ret(err);
        return;
      }

      finish();
      future.ret();
    });
  });

  var err = future.wait();
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

  var finish = Meteor.bindEnvironment(function () {
    Meteor.refresh({collection: collection_name});
    write.committed();
  }, function (e) {
    Meteor._debug("Exception while completing remove: " + e.stack);
  });

  // XXX does not allow options. matches the client.
  selector = _Mongo._rewriteSelector(selector);

  var future = new Future;
  self._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret(err);
      return;
    }

    collection.remove(selector, {/* XXXsafe: true*/}, function (err) {
      if (err) {
        future.ret(err);
        return;
      }

      finish();
      future.ret();
    });
  });

  var err = future.wait();
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

  var finish = Meteor.bindEnvironment(function () {
    Meteor.refresh({collection: collection_name});
    write.committed();
  }, function (e) {
    Meteor._debug("Exception while completing update: " + e.stack);
  });

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
      if (err) {
        future.ret(err);
        return;
      }

      finish();
      future.ret();
    });
  });

  var err = future.wait();
  if (err)
    throw err;
};

_Mongo.prototype.find = function (collection_name, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  return _Mongo._makeCursor(self, collection_name, selector, options);
};

_Mongo.prototype.findOne = function (collection_name, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  return self.find(collection_name, selector, options).fetch()[0];
};

// Cursors

// Returns a _Mongo.Cursor, or throws an exception on
// failure. Creating a cursor involves a database query, and we block
// until it returns.
_Mongo._makeCursor = function (mongo, collection_name, selector, options) {
  var future = new Future;

  options = options || {};
  selector = _Mongo._rewriteSelector(selector);

  mongo._withCollection(collection_name, function (err, collection) {
    if (err) {
      future.ret([false, err]);
      return;
    }
    var cursor = collection.find(selector, options.fields, {
      sort: options.sort, limit: options.limit, skip: options.skip});
    future.ret([true, cursor]);
  });

  var result = future.wait();
  if (!(result[0]))
    throw result[1];

  return new _Mongo.Cursor(mongo, collection_name, selector, options,
                           result[1]);
};

// Do not call directly. Use _Mongo._makeCursor instead.
_Mongo.Cursor = function (mongo, collection_name, selector, options, cursor) {
  var self = this;

  if (!cursor)
    throw new Error("Cursor required");

  // NB: 'options' and 'selector' have already been preprocessed by _makeCursor
  self.mongo = mongo;
  self.collection_name = collection_name;
  self.selector = selector;
  self.options = options;
  self.cursor = cursor;

  self.visited_ids = {};
};

_Mongo.Cursor.prototype.forEach = function (callback) {
  var self = this;
  var future = new Future;

  callback = Meteor.bindEnvironment(callback, function (e) {
    // XXX improve error message (and how we report it)
    Meteor._debug("Exception while running Meteor.Collection forEach callback"
                  + e.stack);
  });

  self.cursor.each(function (err, doc) {
    if (err || !doc || !doc._id) {
      future.ret(err);
    } else if (self.visited_ids[doc._id]) {
      // already seen this doc;  Mongo cursors can
      // return duplicates
    } else {
      self.visited_ids[doc._id] = true;
      callback(doc);
    }
  });

  var err = future.wait();
  if (err)
    throw err;
};

_Mongo.Cursor.prototype.map = function (callback) {
  var self = this;
  var res = [];
  self.forEach(function (doc) {
    res.push(callback(doc));
  });
  return res;
};

_Mongo.Cursor.prototype.rewind = function () {
  var self = this;

  // known to be synchronous
  self.cursor.rewind();

  self.visited_ids = {};
};

_Mongo.Cursor.prototype.fetch = function () {
  var self = this;
  var future = new Future;

  self.cursor.toArray(function (err, res) {
    future.ret([err, res]);
  });

  var result = future.wait();
  if (result[0])
    throw result[0];
  // dedup
  return _.uniq(result[1], false, function(doc) {
    return doc._id; });
};

_Mongo.Cursor.prototype.count = function () {
  var self = this;
  var future = new Future;

  self.cursor.count(function (err, res) {
    future.ret([err, res]);
  });

  var result = future.wait();
  if (result[0])
    throw result[0];
  return result[1];
};

// options to contain:
//  * callbacks:
//    - added (object, before_index)
//    - changed (new_object, at_index)
//    - moved (object, old_index, new_index) - can only fire with changed()
//    - removed (old_object, at_index)
//
// attributes available on returned LiveResultsSet
//  * stop(): end updates

_Mongo.Cursor.prototype.observe = function (options) {
  return new _Mongo.LiveResultsSet(this, options);
};

_Mongo.LiveResultsSet = function (cursor, options) {
  var self = this;

  // copy my cursor, so that the observe can run independently from
  // some other use of the cursor.
  self.cursor = _Mongo._makeCursor(cursor.mongo,
                                   cursor.collection_name,
                                   cursor.selector,
                                   cursor.options);

  // expose collection name
  self.collection_name = cursor.collection_name;

  // previous results snapshot.  on each poll cycle, diffs against
  // results drives the callbacks.
  self.results = [];

  // state for polling
  self.dirty = false; // do we need polling?
  self.pending_writes = []; // people to notify when polling completes
  self.poll_running = false; // is polling in progress now?
  self.polling_suspended = false; // is polling temporarily suspended?

  // (each instance of the class needs to get a separate throttling
  // context -- we don't want to coalesce invocations of markDirty on
  // different instances!)
  self._markDirty = _.throttle(self._unthrottled_markDirty, 50 /* ms */);

  // listen for the invalidation messages that will trigger us to poll
  // the database for changes
  var keys = self.cursor.options.key || {collection: cursor.collection_name};
  if (!(keys instanceof Array))
    keys = [keys];
  self.crossbar_listeners = _.map(keys, function (key) {
    return Meteor._InvalidationCrossbar.listen(key,function (notification,
                                                             complete) {
      // When someone does a transaction that might affect us,
      // schedule a poll of the database. If that transaction happens
      // inside of a write fence, block the fence until we've polled
      // and notified observers.
      var fence = Meteor._CurrentWriteFence.get();
      if (fence)
        self.pending_writes.push(fence.beginWrite());
      self._markDirty();
      complete();
    });
  });

  // user callbacks
  self.added = options.added;
  self.changed = options.changed;
  self.moved = options.moved;
  self.removed = options.removed;

  // run the first _poll() cycle synchronously.
  self._doPoll();

  // every once and a while, poll even if we don't think we're dirty,
  // for eventual consistency with database writes from outside the
  // Meteor universe
  self.refreshTimer = Meteor.setInterval(_.bind(self._markDirty, this),
                                         10 * 1000 /* 10 seconds */);
};

_Mongo.LiveResultsSet.prototype._unthrottled_markDirty = function () {
  var self = this;

  self.dirty = true;
  if (self.polling_suspended)
    return; // don't poll when told not to
  if (self.poll_running)
    return; // only one instance can run at once. just tell it to re-cycle.
  self.poll_running = true;

  Fiber(function () {
    self.dirty = false;
    var writes_for_cycle = self.pending_writes;
    self.pending_writes = [];
    self._doPoll(); // could yield, and set self.dirty
    _.each(writes_for_cycle, function (w) {w.committed();});

    self.poll_running = false;
    if (self.dirty || self.pending_writes.length)
      // rerun ourselves, but through _.throttle
      self._markDirty();
  }).run();
};

// interface for tests to control when polling happens
_Mongo.LiveResultsSet.prototype._suspendPolling = function() {
  this.polling_suspended = true;
};
_Mongo.LiveResultsSet.prototype._resumePolling = function() {
  this.polling_suspended = false;
  this._unthrottled_markDirty(); // poll NOW, don't wait
};


_Mongo.LiveResultsSet.prototype._doPoll = function () {
  var self = this;

  // Get the new query results
  self.cursor.rewind();
  var new_results = self.cursor.fetch();
  var old_results = self.results;

  LocalCollection._diffQuery(old_results, new_results, self);
  self.results = new_results;

};

_Mongo.LiveResultsSet.prototype.stop = function () {
  var self = this;
  _.each(self.crossbar_listeners, function (l) { l.stop(); });
  Meteor.clearInterval(self.refreshTimer);
};

_.extend(Meteor, {
  _Mongo: _Mongo
});
