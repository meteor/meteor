// manager, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection
Meteor.Store = function (name, options) {
  var self = this;
  options = options || {};
  var manager = options.manager;
  var driver = options.driver;
  var type = options.type || 'hash';

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
        Meteor._RemoteStoreDriver)
      driver = Meteor._RemoteStoreDriver;
    else
      driver = Meteor._LocalStoreDriver;
  }

  self._manager = manager;
  self._driver = driver;
  self._store = driver.open(name,type);
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
        self._store.pauseObservers();

        // restore db snapshot
        if (self._was_snapshot) {
          self._store.restore();
          self._was_snapshot = false;
        }
      },

      // Apply an update from the server.
      // XXX better specify this interface (not in terms of a wire message)?
      update: function (msg) {
        self._store.update_msg(msg);
      },

      // Called at the end of a batch of updates.
      endUpdate: function () {
        self._store.resumeObservers();
      },

      // Reset the collection to its original, empty state.
      reset: function () {
        self._store.removeAll();
      }
    });

    if (!ok)
      throw new Error("There is already a collection or store named '" + name + "'");
  }

  // mutation methods
  if (manager) {
    var m = {};
    self._prefix = '/' + name + '/';
    m[self._prefix + 'command'] = function (/* selector, mutator, options */) {
      self._maybe_snapshot();
      // update returns nothing.  allow exceptions to propagate.
      self._store.command.apply(self._store, _.toArray(arguments));
    };

    manager.methods(m);
  }

  // autopublish
  if (manager && manager.onAutopublish)
    manager.onAutopublish(function () {
      var handler = function () { return self.watch('*'); };
      manager.publish(null, handler, {is_auto: true});
    });

  _.each(Object.keys(self._store.reads),function(name) {
    self[name] = function() {
      return self._store.command(name,_.toArray(arguments));
    }
  });

  _.each(Object.keys(self._store.writes),function(name) {
    self[name] = function() {
      var self = this;
      var args = _.toArray(arguments);
      var callback;
      var ret;

      if (args.length && args[args.length - 1] instanceof Function)
        callback = args.pop();

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

      if (self._manager && self._manager !== Meteor.default_server) {
        // just remote to another endpoint, propagate return value or
        // exception.
        if (callback) {
          // asynchronous: on success, callback should return ret
          // (document ID for insert, undefined for update and
          // remove), not the method's result.
          self._manager.call(self._prefix + 'command', name, args, function (error, result) {
            callback(error, !error && ret);
          });
        }
        else
          // synchronous: propagate exception
          self._manager.call(self._prefix + 'command', name, args);

      } else {
        // it's my collection.  descend into the collection object
        // and propagate any exception.
        try {
          self._store.command.call(self._store, name, args);
        } catch (e) {
          if (callback) {
            callback(e);
            return null;
          }
          throw e;
        }

        // on success, return *ret*, not the manager's return value.
        callback && callback(null, ret);
      }

      return ret;
    }
  });
};

Meteor.Store.prototype._maybe_snapshot = function() {
  var self = this;
  if (self._manager && self._manager.registerStore && !self._was_snapshot) {
    self._store.snapshot();
    self._was_snapshot = true;
  }
}

Meteor.Store.prototype.observe = function() {
  var args = _.toArray(arguments)
  return this._store.observe.apply(this._store,args);
}

if (Meteor.is_server) {
  Meteor.Store.prototype.watch = function() {
    var args = _.toArray(arguments)
    return this._store.watch.apply(this._store,args);
  }
}



