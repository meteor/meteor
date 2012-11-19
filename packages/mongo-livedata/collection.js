// manager, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection
Meteor.Collection = function (name, options) {
  var self = this;
  if (options && options.methods) {
    // Backwards compatibility hack with original signature (which passed
    // "manager" directly instead of in options. (Managers must have a "methods"
    // method.)
    // XXX remove before 1.0
    options = {manager: options};
  }
  options = _.extend({
    manager: undefined,
    _driver: undefined,
    _preventAutopublish: false
  }, options);

  if (!name && (name !== null)) {
    Meteor._debug("Warning: creating anonymous collection. It will not be " +
                  "saved or synchronized over the network. (Pass null for " +
                  "the collection name to turn off this warning.)");
  }

  // note: nameless collections never have a manager
  self._manager = name && (options.manager ||
                           (Meteor.isClient ?
                            Meteor.default_connection : Meteor.default_server));

  if (!options._driver) {
    if (name && self._manager === Meteor.default_server &&
        Meteor._RemoteCollectionDriver)
      options._driver = Meteor._RemoteCollectionDriver;
    else
      options._driver = Meteor._LocalCollectionDriver;
  }

  self._collection = options._driver.open(name);
  self._name = name;

  if (name && self._manager.registerStore) {
    // OK, we're going to be a slave, replicating some remote
    // database, except possibly with some temporary divergence while
    // we have unacknowledged RPC's.
    var ok = self._manager.registerStore(name, {
      // Called at the beginning of a batch of updates. batchSize is the number
      // of update calls to expect.
      //
      // XXX This interface is pretty janky. reset probably ought to go back to
      // being its own function, and callers shouldn't have to calculate
      // batchSize. The optimization of not calling pause/remove should be
      // delayed until later: the first call to update() should buffer its
      // message, and then we can either directly apply it at endUpdate time if
      // it was the only update, or do pauseObservers/apply/apply at the next
      // update() if there's another one.
      beginUpdate: function (batchSize, reset) {
        // pause observers so users don't see flicker when updating several
        // objects at once (including the post-reconnect reset-and-reapply
        // stage), and so that a re-sorting of a query can take advantage of the
        // full _diffQuery moved calculation instead of applying change one at a
        // time.
        if (batchSize > 1 || reset)
          self._collection.pauseObservers();

        if (reset)
          self._collection.remove({});
      },

      // Apply an update.
      // XXX better specify this interface (not in terms of a wire message)?
      update: function (msg) {
        var doc = self._collection.findOne(msg.id);

        // Is this a "replace the whole doc" message coming from the quiescence
        // of method writes to an object? (Note that 'undefined' is a valid
        // value meaning "remove it".)
        if (_.has(msg, 'replace')) {
          var replace = msg.replace;
          // An empty doc is equivalent to a nonexistent doc.
          if (replace && _.isEmpty(_.without(_.keys(replace), '_id')))
            replace = undefined;
          if (!replace) {
            if (doc)
              self._collection.remove(msg.id);
          } else if (!doc) {
            self._collection.insert(_.extend({_id: msg.id}, replace));
          } else {
            // XXX check that replace has no $ ops
            self._collection.update(msg.id, replace);
          }
          return;
        }

        // ... otherwise we're applying set/unset messages against specific
        // fields.
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

      // Called around method stub invocations to capture the original versions
      // of modified documents.
      saveOriginals: function () {
        self._collection.saveOriginals();
      },
      retrieveOriginals: function () {
        return self._collection.retrieveOriginals();
      }
    });

    if (!ok)
      throw new Error("There is already a collection named '" + name + "'");
  }

  self._defineMutationMethods();

  // autopublish
  if (!options._preventAutopublish &&
      self._manager && self._manager.onAutopublish)
    self._manager.onAutopublish(function () {
      var handler = function () { return self.find(); };
      self._manager.publish(null, handler, {is_auto: true});
    });
};

///
/// Main collection API
///


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

    if (Meteor.isClient && !callback) {
      // Client can't block, so it can't report errors by exception,
      // only by callback. If they forget the callback, give them a
      // default one that logs the error, so they aren't totally
      // baffled if their writes don't work because their database is
      // down.
      callback = function (err) {
        if (err)
          Meteor._debug(name + " failed: " + (err.reason || err.stack));
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

// We'll actually design an index API later. For now, we just pass through to
// Mongo's, but make it synchronous.
Meteor.Collection.prototype._ensureIndex = function (index, options) {
  var self = this;
  if (!self._collection._ensureIndex)
    throw new Error("Can only call _ensureIndex on server collections");
  self._collection._ensureIndex(index, options);
};

///
/// Remote methods and access control.
///

// Restrict default mutators on collection. allow() and deny() take the
// same options:
//
// options.insert {Function(userId, doc)}
//   return true to allow/deny adding this document
//
// options.update {Function(userId, docs, fields, modifier)}
//   return true to allow/deny updating these documents.
//   `fields` is passed as an array of fields that are to be modified
//
// options.remove {Function(userId, docs)}
//   return true to allow/deny removing these documents
//
// options.fetch {Array}
//   Fields to fetch for these validators. If any call to allow or deny
//   does not have this option then all fields are loaded.
//
// allow and deny can be called multiple times. The validators are
// evaluated as follows:
// - If neither deny() nor allow() has been called on the collection,
//   then the request is allowed if and only if the "insecure" smart
//   package is in use.
// - Otherwise, if any deny() function returns true, the request is denied.
// - Otherwise, if any allow() function returns true, the request is allowed.
// - Otherwise, the request is denied.
//
// Meteor may call your deny() and allow() functions in any order, and may not
// call all of them if it is able to make a decision without calling them all
// (so don't include side effects).

(function () {
  var addValidator = function(allowOrDeny, options) {
    // validate keys
    var VALID_KEYS = ['insert', 'update', 'remove', 'fetch'];
    _.each(_.keys(options), function (key) {
      if (!_.contains(VALID_KEYS, key))
        throw new Error(allowOrDeny + ": Invalid key: " + key);
    });

    var self = this;
    self._restricted = true;

    _.each(['insert', 'update', 'remove'], function (name) {
      if (options[name]) {
        if (!(options[name] instanceof Function)) {
          throw new Error(allowOrDeny + ": Value for `" + name + "` must be a function");
        }
        self._validators[name][allowOrDeny].push(options[name]);
      }
    });

    // Only update the fetch fields if we're passed things that affect
    // fetching. This way allow({}) and allow({insert: f}) don't result in
    // setting fetchAllFields
    if (options.update || options.remove || options.fetch) {
      if (options.fetch && !(options.fetch instanceof Array)) {
        throw new Error(allowOrDeny + ": Value for `fetch` must be an array");
      }
      self._updateFetch(options.fetch);
    }
  };

  Meteor.Collection.prototype.allow = function(options) {
    addValidator.call(this, 'allow', options);
  };
  Meteor.Collection.prototype.deny = function(options) {
    addValidator.call(this, 'deny', options);
  };
})();

Meteor.Collection.prototype._defineMutationMethods = function() {
  var self = this;

  // set to true once we call any allow or deny methods. If true, use
  // allow/deny semantics. If false, use insecure mode semantics.
  self._restricted = false;

  // Insecure mode (default to allowing writes). Defaults to 'undefined'
  // which means use the global Meteor.Collection.insecure.  This
  // property can be overriden by tests or packages wishing to change
  // insecure mode behavior of their collections.
  self._insecure = undefined;

  self._validators = {
    insert: {allow: [], deny: []},
    update: {allow: [], deny: []},
    remove: {allow: [], deny: []},
    fetch: [],
    fetchAllFields: false
  };

  if (!self._name)
    return; // anonymous collection

  // XXX Think about method namespacing. Maybe methods should be
  // "Meteor:Mongo:insert/NAME"?
  self._prefix = '/' + self._name + '/';

  // mutation methods
  if (self._manager) {
    var m = {};

    _.each(['insert', 'update', 'remove'], function (method) {
      m[self._prefix + method] = function (/* ... */) {
        if (this.isSimulation || (!self._restricted && self._isInsecure())) {
          self._collection[method].apply(
            self._collection, _.toArray(arguments));
        } else if (self._restricted) {
          // short circuit if there is no way it will pass.
          if (self._validators[method].allow.length === 0) {
            throw new Meteor.Error(
              403, "Access denied. No allow validators set on restricted " +
                "collection.");
          }

          var validatedMethodName =
                '_validated' + method.charAt(0).toUpperCase() + method.slice(1);
          var argsWithUserId = [this.userId].concat(_.toArray(arguments));
          self[validatedMethodName].apply(self, argsWithUserId);
        } else {
          throw new Meteor.Error(403, "Access denied");
        }
      };
    });

    self._manager.methods(m);
  }
};


Meteor.Collection.prototype._updateFetch = function (fields) {
  var self = this;

  if (!self._validators.fetchAllFields) {
    if (fields) {
      self._validators.fetch = _.union(self._validators.fetch, fields);
    } else {
      self._validators.fetchAllFields = true;
      // clear fetch just to make sure we don't accidentally read it
      self._validators.fetch = null;
    }
  }
};

Meteor.Collection.prototype._isInsecure = function () {
  var self = this;
  if (self._insecure === undefined)
    return Meteor.Collection.insecure;
  return self._insecure;
};

Meteor.Collection.prototype._validatedInsert = function(userId, doc) {
  var self = this;

  // call user validators.
  // Any deny returns true means denied.
  if (_.any(self._validators.insert.deny, function(validator) {
    return validator(userId, doc);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (_.all(self._validators.insert.allow, function(validator) {
    return !validator(userId, doc);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }

  self._collection.insert.call(self._collection, doc);
};

// Simulate a mongo `update` operation while validating that the access
// control rules set by calls to `allow/deny` are satisfied. If all
// pass, rewrite the mongo operation to use $in to set the list of
// document ids to change ##ValidatedChange
Meteor.Collection.prototype._validatedUpdate = function(
    userId, selector, mutator, options) {
  var self = this;

  // compute modified fields
  var fields = [];
  _.each(mutator, function (params, op) {
    if (op[0] !== '$') {
      throw new Meteor.Error(
        403, "Access denied. Can't replace document in restricted collection.");
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
    if (docs.length === 0)  // none satisfied!
      return;
  } else {
    var doc = self._collection.findOne(selector, findOptions);
    if (!doc)  // none satisfied!
      return;
    docs = [doc];
  }

  // call user validators.
  // Any deny returns true means denied.
  if (_.any(self._validators.update.deny, function(validator) {
    return validator(userId, docs, fields, mutator);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (_.all(self._validators.update.allow, function(validator) {
    return !validator(userId, docs, fields, mutator);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }

  // Construct new $in selector to augment the original one. This means we'll
  // never update any doc we didn't validate. We keep around the original
  // selector so that we don't mutate any docs that have been updated to no
  // longer match the original selector.
  var idInClause = {};
  idInClause.$in = _.map(docs, function(doc) {
    return doc._id;
  });
  var idSelector = {_id: idInClause};

  var fullSelector;
  if (LocalCollection._selectorIsId(selector)) {
    // If the original selector was just a lookup by _id, no need to "and" it
    // with the idSelector (and it won't work anyway without explicitly
    // comparing with _id).
    if (docs.length !== 1 || docs[0]._id !== selector)
      throw new Error("Lookup by ID " + selector + " found something else");
    fullSelector = selector;
  } else {
    fullSelector = {$and: [selector, idSelector]};
  }

  self._collection.update.call(
    self._collection, fullSelector, mutator, options);
};

// Simulate a mongo `remove` operation while validating access control
// rules. See #ValidatedChange
Meteor.Collection.prototype._validatedRemove = function(userId, selector) {
  var self = this;

  var findOptions = {};
  if (!self._validators.fetchAllFields) {
    findOptions.fields = {};
    _.each(self._validators.fetch, function(fieldName) {
      findOptions.fields[fieldName] = 1;
    });
  }

  var docs = self._collection.find(selector, findOptions).fetch();
  if (docs.length === 0)  // none satisfied!
    return;

  // call user validators.
  // Any deny returns true means denied.
  if (_.any(self._validators.remove.deny, function(validator) {
    return validator(userId, docs);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (_.all(self._validators.remove.allow, function(validator) {
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
