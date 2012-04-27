// manager, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection
Meteor.Collection = function (name, manager, driver) {
  var self = this;

  if (!name && (name !== null)) {
    Meteor._debug("Warning: creating anonymous collection. It will not be " +
                  "saved or synchronized over the network. (Pass null for " +
                  "the collection name to turn off this warning.)");
  }

  // note: nameless collections never have a manager
  manager = name && (manager ||
                     (Meteor.is_client ?
                      Meteor.default_connection : Meteor.default_server));

  if (!driver) {
    if (name && manager === Meteor.default_server &&
        Meteor._RemoteCollectionDriver)
      driver = Meteor._RemoteCollectionDriver;
    else
      driver = Meteor._LocalCollectionDriver;
  }

  self._manager = manager;
  self._driver = driver;
  self._collection = driver.open(name);
  self._was_snapshot = false;

  if (name && manager.registerStore) {
    // OK, we're going to be a slave, replicating some remote
    // database, except possibly with some temporary divergence while
    // we have unacknowledged RPC's.
    var ok = manager.registerStore(name, {
      // Called at the beginning of a batch of updates. We're supposed
      // to start by backing out any local writes and returning to the
      // last state delivered by the server.
      beginUpdate: function () {
        // pause observers so users don't see flicker.
        self._collection.pauseObservers();

        // restore db snapshot
        if (self._was_snapshot) {
          self._collection.restore();
          self._was_snapshot = false;
        }
      },

      // Apply an update from the server.
      // XXX better specify this interface (not in terms of a wire message)?
      update: function (msg) {
        var doc = self._collection.findOne(msg.id);

        if (doc
            && (!msg.set)
            && _.difference(_.keys(doc), msg.unset, ['_id']).length === 0) {
          // what's left is empty, just remove it.  cannot fail.
          self._collection.remove(msg.id);
        } else if (doc) {
          var mutator = {$set: msg.set, $unset: {}};
          _.each(msg.unset, function (propname) {
            mutator.$unset[propname] = 1;
          });
          // XXX error check return value from update.
          self._collection.update(msg.id, mutator);
        } else {
          // XXX error check return value from insert.
          if (msg.set)
            self._collection.insert(_.extend({_id: msg.id}, msg.set));
        }
      },

      // Called at the end of a batch of updates.
      endUpdate: function () {
        self._collection.resumeObservers();
      },

      // Reset the collection to its original, empty state.
      reset: function () {
        self._collection.remove({});
      }
    });

    if (!ok)
      throw new Error("There is already a collection named '" + name + "'");
  }

  // mutation methods
  if (manager) {
    var m = {};
    // XXX what if name has illegal characters in it?
    self._prefix = '/' + name + '/';
    m[self._prefix + 'insert'] = function (/* selector, options */) {
      self._maybe_snapshot();
      // Allow exceptions to propagate
      self._collection.insert.apply(self._collection, _.toArray(arguments));
    };

    m[self._prefix + 'update'] = function (/* selector, mutator, options */) {
      self._maybe_snapshot();
      // Allow exceptions to propagate
      self._collection.update.apply(self._collection, _.toArray(arguments));
    };

    m[self._prefix + 'remove'] = function (/* selector */) {
      self._maybe_snapshot();
      // Allow exceptions to propagate
      self._collection.remove.apply(self._collection, _.toArray(arguments));
    };

    manager.methods(m);
  }

  // autopublish
  if (manager && manager.onAutopublish)
    manager.onAutopublish(function () {
      var handler = function () { return self.find(); };
      manager.publish(null, handler, {is_auto: true});
    });
};

_.extend(Meteor.Collection.prototype, {
  find: function (/* selector, options */) {
    // Collection.find() (return all docs) behaves differently
    // from Collection.find(undefined) (return 0 docs).  so be
    // careful about preserving the length of arguments.
    var self = this;
    return self._collection.find.apply(self._collection, _.toArray(arguments));
  },

  findOne: function (/* selector, options */) {
    var self = this;
    return self._collection.findOne.apply(self._collection, _.toArray(arguments));
  },

  _maybe_snapshot: function () {
    var self = this;
    if (self._manager && self._manager.registerStore && !self._was_snapshot) {
      self._collection.snapshot();
      self._was_snapshot = true;
    }
  }

});

// 'insert' immediately returns the inserted document's new _id.  The
// others return nothing.
//
// Otherwise, the semantics are exactly like other methods: they take
// a callback as an optional last argument; if no callback is
// provided, they block until the operation is complete, and throw an
// exception if it fails; if a callback is provided, then they don't
// necessarily block, and they call the callback when they finish with
// zero arguments on success, or one argument, an exception, on
// failure; on the client, blocking is impossible, so if a callback
// isn't provided, they just return immediately and any error
// information is lost.
//
// There's one more tweak. On the client, if you don't provide a
// callback, then if there is an error, a message will be logged with
// Meteor._debug.
//
// The intent (though this is actually determined by the underlying
// drivers) is that the operations should be done synchronously, not
// generating their result until the database has acknowledged
// them. In the future maybe we should provide a flag to turn this
// off.
_.each(["insert", "update", "remove"], function (name) {
  Meteor.Collection.prototype[name] = function (/* arguments */) {
    var self = this;
    var args = _.toArray(arguments);

    if (args.length && args[args.length - 1] instanceof Function)
      var callback = args.pop();

    if (Meteor.is_client && !callback)
      // Client can't block, so it can't report errors by exception,
      // only by callback. If they forget the callback, give them a
      // default one that logs the error, so they aren't totally
      // baffled if their writes don't work because their database is
      // down.
      callback = function (err) {
        if (err)
          Meteor._debug(name + " failed: " + err.error + " -- " + err.reason);
      };

    if (name === "insert") {
      if (!args.length)
        throw new Error("insert requires an argument");
      // shallow-copy the document and generate an ID
      args[0] = _.extend({}, args[0]);
      if ('_id' in args[0])
        throw new Error("Do not pass an _id to insert. Meteor will generate the _id for you.");
      var ret = args[0]._id = Meteor.uuid();
    }

    if (self._manager && self._manager !== Meteor.default_server) {
      // NB: on failure, allow exception to propagate
      self._manager.apply(self._prefix + name, args, callback);
    }
    else {
      try {
        self._collection[name].apply(self._collection, args);
      } catch (e) {
        if (callback) {
          callback(e);
          return;
        }

        // Note that on the client, this will never happen, because
        // we will have been provided with a default callback. (This
        // is nice because it matches the behavior of named
        // collections, which on the client never throw exceptions
        // directly.)
        throw e;
      }

      callback && callback();
    }

    return ret;
  };
});
