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

  // holds active observes
  self.observers = {};
  self.next_observer_id = 1;

  self.collection_queue = [];

  // collection name => true, or 'true' for all, 'false' for none
  self.dirty = false;
  self.fence_listeners = [];
  self.flush_running = false;
  self.flush_queued = false;

  MongoDB.connect(url, function(err, db) {
    self.db = db;

    // drain queue of pending callbacks
    var c;
    while ((c = self.collection_queue.pop())) {
      db.collection(c.name, c.callback);
    }
  });

  // refresh all outstanding observers every 10 seconds.  they are
  // also triggered on DB updates.
  setInterval(function () {
    self._markDirty();
  }, 10000);
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

// mark a collection as dirty (or the whole database, if no collection
// name is provided.) arrange for observers against the dirty sector
// to update themselves.
_Mongo.prototype._markDirty = function (collection_name) {
  var self = this;

  if (collection_name === undefined)
    self.dirty = true;
  else if (self.dirty !== true) {
    self.dirty = self.dirty || {};
    self.dirty[collection_name] = true;
  }

  self._flushObservers();
};

_Mongo.prototype._flushObservers = _.throttle(function () {
  var self = this;

  // only let one instance of flush run at once.
  if (self.flush_running) {
    self.flush_queued = true;
    return;
  }
  self.flush_running = true;
  var listeners_for_cycle = self.fence_listeners;
  self.fence_listeners = [];

  Fiber(function () {
    var dirty = self.dirty;
    self.dirty = false;

    _.each(self.observers, function (o) {
      if (dirty && dirty === true || dirty[o.collection_name])
        o._poll();
    });

    _.each(listeners_for_cycle, function (f) {f();});

    self.flush_running = false;
    if (self.flush_queued || self.fence_listeners.length) {
      self.flush_queued = false;
      self._flushObservers();
    }
  }).run();
}, 50 /* 50 ms */);

//////////// Public API //////////

_Mongo.prototype.insert = function (collection_name, document) {
  var self = this;

  var future = new Future;
  self._withCollection(collection_name, function(err, collection) {
    // XXX err handling
    collection.insert(document, {/* safe: true */}, function(err) {
      // XXX err handling
    });

    self._markDirty(collection_name);
    future.ret();
  });

  return future.wait();
};

_Mongo.prototype.remove = function (collection_name, selector) {
  var self = this;

  // XXX does not allow options. matches the client.
  selector = _Mongo._rewriteSelector(selector);

  var future = new Future;
  self._withCollection(collection_name, function(err, collection) {
    // XXX err handling
    collection.remove(selector, {/* safe: true */}, function(err) {
      // XXX err handling
    });

    self._markDirty(collection_name);
    future.ret();
  });

  return future.wait();
};

_Mongo.prototype.update = function (collection_name, selector, mod, options) {
  var self = this;

  selector = _Mongo._rewriteSelector(selector);
  if (!options) options = {};

  var future = new Future;
  self._withCollection(collection_name, function(err, collection) {
    // XXX err handling

    var opts = {/* safe: true */};
    // explictly enumerate options that minimongo supports
    if (options.upsert) opts.upsert = true;
    if (options.multi) opts.multi = true;

    collection.update(selector, mod, opts, function(err) {
      // XXX err handling
    });

    self._markDirty(collection_name);
    future.ret();
  });

  return future.wait();
};

_Mongo.prototype.find = function (collection_name, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  return new _Mongo.Cursor(self, collection_name, selector, options);
};

_Mongo.prototype.findOne = function (collection_name, selector, options) {
  var self = this;

  if (arguments.length === 1)
    selector = {};

  return this.find(collection_name, selector, options).fetch()[0];
};

// After making a write (with insert, update, remove), observers are
// notified asynchronously. Call 'callback' once it is guaranteed that
// all writes that have been made so far have been reflected in
// observer notifications. (Since our execution environment is
// single-threaded, this is well-defined -- a write "has been made" if
// it's returned, and an observer "has been notified" if its callback
// has returned.)
_Mongo.prototype.writeFence = function (callback) {
  var self = this;
  if (!self.dirty)
    callback();
  else
    // XXX it'd be better to actually kick off a polling cycle
    // here. have observers natually be notified on some long-ish
    // polling cycle, like 250ms, and immediately (or, say, with 50ms
    // throttling) in response to writeFence().
    self.fence_listeners.push(callback);
};

// Cursors

_Mongo.Cursor = function (mongo, collection_name, selector, options) {
  var self = this;

  self.mongo = mongo;
  self.collection_name = collection_name;
  self.selector = _Mongo._rewriteSelector(selector);
  self.options = options || {};

  var future = new Future;

  self.mongo._withCollection(collection_name, function(err, collection) {
    // XXX err handling
    var cursor = collection.find(self.selector, self.options.fields, self.options.skip, self.options.limit, self.options.sort);
    future.ret(cursor);
  });

  this.cursor = future.wait();
};

_Mongo.Cursor.prototype.forEach = function (callback) {
  var self = this;
  var future = new Future;

  self.cursor.each(function (err, doc) {
    if (err || !doc)
      future.ret(err);
    else
      callback(doc);
  });
  return future.wait();
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
};

_Mongo.Cursor.prototype.fetch = function () {
  var self = this;
  var future = new Future;

  self.cursor.toArray(function (err, res) {
    future.ret(err || res);
  });

  return future.wait();
};

_Mongo.Cursor.prototype.count = function () {
  var self = this;
  var future = new Future;

  self.cursor.count(function (err, res) {
    future.ret(err || res);
  });

  return future.wait();
};

// options to contain:
//  * callbacks:
//    - added (object, before_index)
//    - changed (new_object, at_index)
//    - moved (object, old_index, new_index) - can only fire with changed()
//    - removed (id, at_index)
//
// attributes available on returned LiveResultsSet
//  * stop(): end updates

_Mongo.Cursor.prototype.observe = function (options) {
  return new _Mongo.LiveResultsSet(this, options);
};

_Mongo.LiveResultsSet = function (cursor, options) {
  // copy my cursor, so that the observe can run independently from
  // some other use of the cursor.
  this.cursor = new _Mongo.Cursor(cursor.mongo,
                                  cursor.collection_name,
                                  cursor.selector,
                                  cursor.options);

  // expose collection name
  this.collection_name = cursor.collection_name;

  // unique handle for this live query
  this.qid = this.cursor.mongo.next_observer_id++;

  // previous results snapshot.  on each poll cycle, diffs against
  // results drives the callbacks.
  this.results = {};
  this.indexes = {};

  this.added = options.added;
  this.changed = options.changed;
  this.moved = options.moved;
  this.removed = options.removed;

  // trigger the first _poll() cycle immediately.
  this._poll();

  // register myself with the mongo driver
  this.cursor.mongo.observers[this.qid] = this;
};

_Mongo.LiveResultsSet.prototype._fetchResults = function (results, indexes) {
  var self = this;
  var index = 0;

  self.cursor.rewind();
  self.cursor.forEach(function (obj) {
    results[obj._id] = obj;
    indexes[obj._id] = index++;
  });
};

_Mongo.LiveResultsSet.prototype._poll = function () {
  var self = this;

  var old_results = self.results;
  var old_indexes = self.indexes;
  var new_results = {};
  var new_indexes = {};

  var callbacks = [];

  self._fetchResults(new_results, new_indexes);

  _.each(new_results, function (obj) {
    if (self.added && !old_results[obj._id])
      self.added(obj, new_indexes[obj._id]);

    else if (self.changed && !_.isEqual(new_results[obj._id], old_results[obj._id]))
      self.changed(obj, old_indexes[obj._id], old_results[obj._id]);

    if (self.moved && new_indexes[obj._id] !== old_indexes[obj._id])
      self.moved(obj, old_indexes[obj._id], new_indexes[obj._id]);
  });

  for (var id in old_results)
    if (self.removed && !(id in new_results))
      self.removed(id, old_indexes[id], old_results[id]);

  self.results = new_results;
  self.indexes = new_indexes;
};

_Mongo.LiveResultsSet.prototype.stop = function () {
  var self = this;
  delete self.cursor.mongo.observers[self.qid];
};

_.extend(Meteor, {
  _Mongo: _Mongo
});
