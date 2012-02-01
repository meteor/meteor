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

  // protect against dangerous selectors.  falsey and {_id: falsey}
  // are both likely programmer error, and not what you want,
  // particularly for destructive operations.
  function rewrite_selector (selector) {
    // shorthand -- scalars match _id
    if ((typeof selector === 'string') || (typeof selector === 'number'))
      selector = {_id: selector};

    if (!selector || (('_id' in selector) && !selector._id))
      // can't match anything
      return {_id: Meteor.uuid()};
    else
      return selector;
  }

  //////////// Public API //////////

  function Cursor (collection_name, selector, options) {
    var future = new Future;
    withCollection(collection_name, function(err, collection) {
      // XXX err handling

      selector = rewrite_selector(selector);

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

  Cursor.prototype.fetch = function () {
    var self = this;
    var future = new Future;

    self.cursor.toArray(function (err, res) {
      future.return(err || res);
    });

    return future.wait();
  };

  Cursor.prototype.count = function () {
    var self = this;
    var future = new Future;

    self.cursor.count(function (err, res) {
      future.return(err || res);
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

    selector = rewrite_selector(selector);

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

    selector = rewrite_selector(selector);

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
