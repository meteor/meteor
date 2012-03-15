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

      // Called at the end of a batch of updates, just for symmetry,
      // or in case some future database driver needs it.
      endUpdate: function () {
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
      return self._collection.insert.apply(self._collection, _.toArray(arguments));
    };

    m[self._prefix + 'update'] = function (/* selector, mutator, options */) {
      self._maybe_snapshot();
      return self._collection.update.apply(self._collection, _.toArray(arguments));
    };

    m[self._prefix + 'remove'] = function (/* selector */) {
      self._maybe_snapshot();
      return self._collection.remove.apply(self._collection, _.toArray(arguments));
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
  },

  // XXX provide a way for the caller to find out about errors from
  // the server? probably the answer is: detect a function at the end
  // of the arguments, use as a callback ... same semantics as methods
  // usually have?

  insert: function (doc) {
    var self = this;

    // shallow-copy the document and generate an ID
    doc = _.extend({}, doc);
    doc._id = Meteor.uuid();

    if (self._manager)
      self._manager.call(self._prefix + 'insert', doc);
    else
      self._collection.insert(doc);

    return doc;
  },

  update: function (/* arguments */) {
    var self = this;

    if (self._manager)
      self._manager.apply(self._prefix + 'update', _.toArray(arguments));
    else
      self._collection.update.apply(self._collection, _.toArray(arguments));
  },

  remove: function (/* arguments */) {
    var self = this;

    if (self._manager)
      self._manager.apply(self._prefix + 'remove', _.toArray(arguments));
    else
      self._collection.remove.apply(self._collection, _.toArray(arguments));
  }
});
