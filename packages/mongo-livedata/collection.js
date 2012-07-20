// manager, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection
// XXX probably a good idea to change these arguments to be an options map
Meteor.Collection = function (name, manager, driver, preventAutopublish) {
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
  self._name = name;

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

  self._defineMutationMethods();

  // autopublish
  if (!preventAutopublish && manager && manager.onAutopublish)
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

Meteor.Collection.prototype._defineMutationMethods = function() {
  var self = this;

  self._validators = {
    insert: [],
    update: [],
    remove: [],
    fetch: [],
    fetchAllFields: false
  };

  if (!self._name)
    return; // anonymous collection

  // XXX what if name has illegal characters in it?
  self._prefix = '/' + self._name + '/';

  // since tests need to check the effects of adding and removing the
  // `insecure` package, which sets Meteor.Collection.insecure, we
  // need this var
  var insecure = Meteor.Collection.insecure;

  // mutation methods
  if (self._manager) {
    var m = {};
    // XXX what if name has illegal characters in it?
    m[self._prefix + 'insert'] = function (doc) {
      self._maybe_snapshot();

      if (!this.is_simulation) {
        if (self._restricted) {
          if (!self._allowInsert(this.userId(), doc))
            throw new Meteor.Error(403, "Access denied");
        } else {
          if (!insecure)
            throw new Meteor.Error(403, "Access denied");
        }
      }

      // insert returns nothing.  allow exceptions to propagate.
      self._collection.insert(doc);
    };

    m[self._prefix + 'update'] = function (selector, mutator, options) {
      self._maybe_snapshot();

      if (this.is_simulation) {
        // insert returns nothing.  allow exceptions to propagate.
        self._collection.update(selector, mutator, options);
      } else {
        if (self._restricted) {
          self._validatedUpdate(this.userId(), selector, mutator, options);
        } else {
          if (insecure) {
            // update returns nothing.  allow exceptions to propagate.
            self._collection.update(selector, mutator, options);
          } else {
            throw new Meteor.Error(403, "Access denied");
          }
        }
      }
    };

    m[self._prefix + 'remove'] = function (selector) {
      self._maybe_snapshot();

      if (this.is_simulation) {
        // remove returns nothing.  allow exceptions to propagate.
        self._collection.remove(selector);
      } else {
        if (self._restricted) {
          self._validatedRemove(this.userId(), selector);
        } else {
          if (insecure) {
            // insert returns nothing.  allow exceptions to propagate.
            self._collection.remove(selector);
          } else {
            throw new Meteor.Error(403, "Access denied");
          }
        }
      }
    };

    self._manager.methods(m);
  }
};

// Restrict default mutators on collection. Can be called multiple
// times, in which case all validators must be satisfied.
//
// options.insert {Function(userId, doc)}
//   return true to allow the user to add this document
//
// options.update {Function(userId, docs, fields, modifier)}
//   return true to allow the user to update these documents.
//   `fields` is passed as an array of fields that are to be modified
//
// options.remove {Function(userId, docs)}
//   return true to allow the user to remove these documents
//
// options.fetch {Array}
//   Fields to fetch for these validators. If any call to allow does
//   not have this option then all fields are loaded.
Meteor.Collection.prototype.allow = function(options) {
  var self = this;
  self._restricted = true;

  if (options.insert)
    self._validators.insert.push(options.insert);
  if (options.update)
    self._validators.update.push(options.update);
  if (options.remove)
    self._validators.remove.push(options.remove);

  if (!self._validators.fetchAllFields) {
    if (options.fetch) {
      self._validators.fetch = _.union(self._validators.fetch, options.fetch);
    } else {
      self._validators.fetchAllFields = true;
      // clear fetch just to make sure we don't accidentally read it
      self._validators.fetch = null;
    }
  }
};

// assuming the collection is restricted
Meteor.Collection.prototype._allowInsert = function(userId, doc) {
  if (this._validators.insert.length === 0) {
    throw new Meteor.Error(403, "Access denied. No insert validators set on restricted collection.");
  }

  // all validators should return true
  return !_.any(this._validators.insert, function(validator) {
    return !validator(userId, doc);
  });
};

// Simulate a mongo `update` operation while validating that the
// access control rules set by calls to `allow` are satisfied. If all
// pass, rewrite the mongo operation to use $in to set the list of
// document ids to change ##ValidatedChange
Meteor.Collection.prototype._validatedUpdate = function(userId, selector, mutator, options) {
  var self = this;

  if (self._validators.update.length === 0) {
    throw new Meteor.Error(403, "Access denied. No update validators set on restricted collection.");
  }

  // compute modified fields
  var fields = [];
  _.each(mutator, function (params, op) {
    if (op[0] !== '$') {
      throw new Meteor.Error(403, "Access denied. Can't replace document in restricted collection.");
    } else {
      _.each(_.keys(params), function (field) {
        // treat dotted fields as if they are replacing their
        // top-level part
        if (field.indexOf('.') !== -1)
          field = field.substring(0, field.indexOf('.'));

        // record the field we are trying to change
        if (!_.contains(fields, field))
          fields.push(field);
      });
    }
  });

  var findOptions = {};
  if (!self._validators.fetchAllFields) {
    findOptions.fields = {};
    _.each(self._validators.fetch, function(fieldName) {
      findOptions.fields[fieldName] = 1;
    });
  }

  var docs;
  if (options && options.multi) {
    docs = self._collection.find(selector, findOptions).fetch();
  } else {
    var doc = self._collection.findOne(selector, findOptions);
    if (!doc) // none satisfied!
      return;
    docs = [doc];
  }

  // verify that all validators return true
  if (_.any(self._validators.update, function(validator) {
    return !validator(userId, docs, fields, mutator);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }

  // construct new $in selector to replace the original one
  var idInClause = {};
  idInClause.$in = _.map(docs, function(doc) {
    return doc._id;
  });
  var idSelector = {_id: idInClause};

  self._collection.update.call(
    self._collection,
    idSelector,
    mutator,
    options);
};

// Simulate a mongo `remove` operation while validating access control
// rules. See #ValidatedChange
Meteor.Collection.prototype._validatedRemove = function(userId, selector) {
  var self = this;

  if (self._validators.remove.length === 0) {
    throw new Meteor.Error(403, "Access denied. No remove validators set on restricted collection.");
  }

  var findOptions = {};
  if (!self._validators.fetchAllFields) {
    findOptions.fields = {};
    _.each(self._validators.fetch, function(fieldName) {
      findOptions.fields[fieldName] = 1;
    });
  }

  var docs = self._collection.find(selector, findOptions).fetch();

  // verify that all validators return true
  if (_.any(self._validators.remove, function(validator) {
    return !validator(userId, docs);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }

  // construct new $in selector to replace the original one
  var idInClause = {};
  idInClause.$in = _.map(docs, function(doc) {
    return doc._id;
  });
  var idSelector = {_id: idInClause};

  self._collection.remove.call(self._collection, idSelector);
};

// 'insert' immediately returns the inserted document's new _id.  The
// others return nothing.
//
// Otherwise, the semantics are exactly like other methods: they take
// a callback as an optional last argument; if no callback is
// provided, they block until the operation is complete, and throw an
// exception if it fails; if a callback is provided, then they don't
// necessarily block, and they call the callback when they finish with
// error and result arguments.  (The insert method provides the
// document ID as its result; update and remove don't provide a result.)
//
// On the client, blocking is impossible, so if a callback
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
    var callback;
    var ret;

    if (args.length && args[args.length - 1] instanceof Function)
      callback = args.pop();

    if (Meteor.is_client && !callback) {
      // Client can't block, so it can't report errors by exception,
      // only by callback. If they forget the callback, give them a
      // default one that logs the error, so they aren't totally
      // baffled if their writes don't work because their database is
      // down.
      callback = function (err) {
        if (err)
          Meteor._debug(name + " failed: " + err.error + " -- " + err.reason);
      };
    }

    if (name === "insert") {
      if (!args.length)
        throw new Error("insert requires an argument");
      // shallow-copy the document and generate an ID
      args[0] = _.extend({}, args[0]);
      if ('_id' in args[0])
        throw new Error("Do not pass an _id to insert. Meteor will generate the _id for you.");
      ret = args[0]._id = Meteor.uuid();
    }

    if (self._manager && self._manager !== Meteor.default_server) {
      // just remote to another endpoint, propagate return value or
      // exception.
      if (callback) {
        // asynchronous: on success, callback should return ret
        // (document ID for insert, undefined for update and
        // remove), not the method's result.
        self._manager.apply(self._prefix + name, args, function (error, result) {
          callback(error, !error && ret);
        });
      } else {
        // synchronous: propagate exception
        self._manager.apply(self._prefix + name, args);
      }

    } else {
      // it's my collection.  descend into the collection object
      // and propagate any exception.
      try {
        self._collection[name].apply(self._collection, args);
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

    // both sync and async, unless we threw an exception, return ret
    // (new document ID for insert, undefined otherwise).
    return ret;
  };
});
