/**
 * Provide a consistent minimongo-like API using fibers.  This is only
 * for use on the server.
 *
 * NOTE: the public API methods must be run within a fiber. If you call
 * these outside of a fiber they will explode!
 */

(function () {

var Mongo = __meteor_bootstrap__.require('mongodb');

var Future = __meteor_bootstrap__.require('fibers/future');

//////////// Internal //////////

// stash mongo connection and pending operations before connection is
// established
var client;
var with_collection_queue;

/**
 * Initialize the Meteor library
 *
 * @param url {String} mongo DB URL (eg mongodb://localhost:27017/meteor)
 */
function init (url) {
  with_collection_queue = [];

  Mongo.connect(url, function(err, _client) {
    client = _client;

    // drain queue of pending callbacks
    var c;
    while (c = with_collection_queue.pop()) {
      client.collection(c.name, c.callback);
    }
  });
}


// withCollection.  callback: lambda (err, collection) called when
// collection is ready to go, or on error.
function withCollection (collection_name, callback) {
  if (client) {
    client.collection(collection_name, callback);
  } else {
    with_collection_queue.push({name: collection_name, callback: callback});
  }
}

//////////// Public API //////////

function Cursor (collection_name, selector, options) {
  var future = new Future;
  withCollection(collection_name, function(err, collection) {
    // XXX err handling

    var single_result = false;
    // if single id is passed
    // XXX deal with both string and objectid
    if (typeof selector === 'string') {
      selector = {_id: selector};
      single_result = true;
    } else if (!selector) {
      selector = {};
    }

    var cursor = collection.find(selector);
    // XXX is there a way to do this as for x in ['sort', 'limit', 'skip']?
    if (options && options.sort)
      cursor = cursor.sort(options.sort);
    if (options && options.limit)
      cursor = cursor.limit(options.limit);
    if (options && options.skip)
      cursor = cursor.skip(options.skip);

    future.return(cursor);
  });
  this.cursor = future.wait();
};

Cursor.prototype.forEach = function (callback) {
  var self = this;
  var future = new Future;

  self.cursor.each(function (err, doc) {
    if (err || !doc)
      future.return(err);
    else
      callback(null, doc);
  });
  return future.wait();
};

Cursor.prototype.map = function (callback) {
  var self = this;
  var res = [];
  self.forEach(function (doc) {
    res.push(callback(doc));
  });
  return res;
};

Cursor.prototype.rewind = function () {
  var self = this;

  self.cursor.rewind();
};

Cursor.prototype.fetch = function (length) {
  var self = this;
  var future = new Future;
  var res = [];

  self.cursor.each(function (err, doc) {
    if (err)
      future.return(err);
    else if (!doc)
      future.return(res);

    res.push(doc);

    if (length && res.length === length)
      // immediately return w/o consuming another doc in the iterator
      future.return(res);
  });

  return future.wait();
};

Cursor.prototype.get = function (i) {
  var self = this;
  return self.fetch(i + 1)[0];
};

Cursor.prototype.count = function () {
  var self = this;
  var future = new Future;

  self.cursor.count(function (err, res) {
    future.return(res);
  });

  return future.wait();
};

function insert (collection_name, document) {
  var future = new Future;
  // XXX this blocks for the operation to complete (safe:true), because
  // I couldn't convince myself it was safe not to. Not sure if it is
  // needed, really.
  withCollection(collection_name, function(err, collection) {
    // XXX err handling
    collection.insert(document, {safe: true}, function(err) {
      // XXX err handling
      future.return();
    });
  });

  return future.wait();
};

function remove (collection_name, selector) {
  var future = new Future;
  // XXX this blocks for the operation to complete (safe:true), because
  // I couldn't convince myself it was safe not to. Not sure if it is
  // needed, really.

  // XXX does not allow options. matches the client.
  // XXX consider allowing string -> {_id: id} shortcut.

  if (typeof(selector) === "string")
    selector = {_id: selector};

  withCollection(collection_name, function(err, collection) {
    // XXX err handling
    collection.remove(selector, {safe:true}, function(err) {
      // XXX err handling
      future.return();
    });
  });

  return future.wait();
};

function update (collection_name, selector, mod, options) {
  var future = new Future;
  // XXX this blocks for the operation to complete (safe:true), because
  // I couldn't convince myself it was safe not to. Not sure if it is
  // needed, really.

  if (typeof(selector) === "string")
    selector = {_id: selector};

  if (!options) options = {};
  // Default to multi. This is the oppposite of mongo. We'll see how it goes.
  if (typeof(options.multi) === "undefined")
    options.multi = true

  withCollection(collection_name, function(err, collection) {
    // XXX err handling

    var opts = {safe: true};
    // explictly enumerate options that minimongo supports
    if (options.upsert) opts.upsert = true;
    if (options.multi) opts.multi = true;

    collection.update(selector, mod, opts, function(err) {
      // XXX err handling
      future.return();
    });
  });

  return future.wait();
};

Meteor._mongo_driver = {
  Cursor: Cursor,
  insert: insert,
  remove: remove,
  update: update
};

// start database
init(__meteor_bootstrap__.mongo_url);

})();
