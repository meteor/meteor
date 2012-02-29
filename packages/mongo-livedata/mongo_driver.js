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
      db.collection(c.name, c.callback);
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

//////////// Public API //////////

_Mongo.prototype.insert = function (collection_name, document) {
  var self = this;

  var future = new Future;
  // XXX this blocks for the operation to complete (safe:true), because
  // I couldn't convince myself it was safe not to. Not sure if it is
  // needed, really.

  self._withCollection(collection_name, function(err, collection) {
    // XXX err handling
    collection.insert(document, {safe: true}, function(err) {
      // XXX err handling
      future.ret();
    });
  });

  return future.wait();
};

_Mongo.prototype.remove = function (collection_name, selector) {
  var self = this;

  var future = new Future;
  // XXX this blocks for the operation to complete (safe:true), because
  // I couldn't convince myself it was safe not to. Not sure if it is
  // needed, really.

  // XXX does not allow options. matches the client.

  selector = _Mongo._rewriteSelector(selector);

  self._withCollection(collection_name, function(err, collection) {
    // XXX err handling
    collection.remove(selector, {safe:true}, function(err) {
      // XXX err handling
      future.ret();
    });
  });

  return future.wait();
};

_Mongo.prototype.update = function (collection_name, selector, mod, options) {
  var self = this;

  var future = new Future;
  // XXX this blocks for the operation to complete (safe:true), because
  // I couldn't convince myself it was safe not to. Not sure if it is
  // needed, really.

  selector = _Mongo._rewriteSelector(selector);
  if (!options) options = {};

  self._withCollection(collection_name, function(err, collection) {
    // XXX err handling

    var opts = {safe: true};
    // explictly enumerate options that minimongo supports
    if (options.upsert) opts.upsert = true;
    if (options.multi) opts.multi = true;

    collection.update(selector, mod, opts, function(err) {
      // XXX err handling
      future.ret();
    });
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

    var cursor = collection.find(self.selector);
    // XXX is there a way to do this as for x in ['sort', 'limit', 'skip']?
    if (self.options.sort)
      cursor = cursor.sort(self.options.sort);
    if (self.options.limit)
      cursor = cursor.limit(self.options.limit);
    if (self.options.skip)
      cursor = cursor.skip(self.options.skip);

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

_.extend(Meteor, {
  _Mongo: _Mongo
});
