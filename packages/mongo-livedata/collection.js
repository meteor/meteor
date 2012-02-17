if (typeof Meteor === "undefined") Meteor = {};

// manager, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection
Meteor.Collection = function (name, manager, driver) {
  var self = this;
  // note: nameless collections never have a manager
  manager = name && (manager || App);

  if (!driver) {
    if (name && manager === App && Meteor._RemoteCollectionDriver)
      driver = Meteor._RemoteCollectionDriver;
    else
      driver = Meteor._LocalCollectionDriver;
  }

  // XXX LivedataServer.publish() presently reaches into us and reads
  // _name. Total hack, needs to go away.
  self._name = name;
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
      update: function (msg) {
        var doc = self._collection.findOne(msg.id);

        if (doc
            && (!msg.set || msg.set.length === 0)
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

  // XXX temporary hack to provide sugar in LivedataServer.publish()
  if (name && manager && manager._hack_collections) {
    if (name in manager._hack_collections)
      throw new Error("There is already a collection named '" + name + "'");
    manager._hack_collections[name] = self;
  }

  // autopublish
  if (manager.onAutopublish)
    manager.onAutopublish(function () {
      manager.publish(null, {collection: self, is_auto: true});
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
    if (self.manager && self.manager.registerStore && !self._was_snapshot) {
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
      return self._manager.call(self._prefix + 'insert', doc);
    else
      return self._collection.insert(doc);

  },

  update: function (/* arguments */) {
    var self = this;

    if (self._manager)
      return self._manager.apply(self._prefix + 'update', _.toArray(arguments));
    else
      return self._collection.update.apply(self._collection, _.toArray(arguments));

  },

  remove: function (/* arguments */) {
    var self = this;

    if (self._manager)
      return self._manager.apply(self._prefix + 'remove', _.toArray(arguments));
    else
      return self._collection.remove.apply(self._collection, _.toArray(arguments));
  }
});
