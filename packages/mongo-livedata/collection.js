// options.connection, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection

Meteor.Collection = function (name, options) {
  var self = this;
  if (! (self instanceof Meteor.Collection))
    throw new Error('use "new" to construct a Meteor.Collection');

  if (!name && (name !== null)) {
    Meteor._debug("Warning: creating anonymous collection. It will not be " +
                  "saved or synchronized over the network. (Pass null for " +
                  "the collection name to turn off this warning.)");
    name = null;
  }

  if (name !== null && typeof name !== "string") {
    throw new Error(
      "First argument to new Meteor.Collection must be a string or null");
  }

  if (options && options.methods) {
    // Backwards compatibility hack with original signature (which passed
    // "connection" directly instead of in options. (Connections must have a "methods"
    // method.)
    // XXX remove before 1.0
    options = {connection: options};
  }
  // Backwards compatibility: "connection" used to be called "manager".
  if (options && options.manager && !options.connection) {
    options.connection = options.manager;
  }
  options = _.extend({
    connection: undefined,
    idGeneration: 'STRING',
    transform: null,
    _driver: undefined,
    _preventAutopublish: false
  }, options);

  switch (options.idGeneration) {
  case 'MONGO':
    self._makeNewID = function () {
      return new Meteor.Collection.ObjectID();
    };
    break;
  case 'STRING':
  default:
    self._makeNewID = function () {
      return Random.id();
    };
    break;
  }

  self._transform = LocalCollection.wrapTransform(options.transform);

  if (! name || options.connection === null)
    // note: nameless collections never have a connection
    self._connection = null;
  else if (options.connection)
    self._connection = options.connection;
  else if (Meteor.isClient)
    self._connection = Meteor.connection;
  else
    self._connection = Meteor.server;

  if (!options._driver) {
    if (name && self._connection === Meteor.server &&
        typeof MongoInternals !== "undefined" &&
        MongoInternals.defaultRemoteCollectionDriver) {
      options._driver = MongoInternals.defaultRemoteCollectionDriver();
    } else {
      options._driver = LocalCollectionDriver;
    }
  }

  self._collection = options._driver.open(name, self._connection);
  self._name = name;

  if (self._connection && self._connection.registerStore) {
    // OK, we're going to be a slave, replicating some remote
    // database, except possibly with some temporary divergence while
    // we have unacknowledged RPC's.
    var ok = self._connection.registerStore(name, {
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
        var mongoId = LocalCollection._idParse(msg.id);
        var doc = self._collection.findOne(mongoId);

        // Is this a "replace the whole doc" message coming from the quiescence
        // of method writes to an object? (Note that 'undefined' is a valid
        // value meaning "remove it".)
        if (msg.msg === 'replace') {
          var replace = msg.replace;
          if (!replace) {
            if (doc)
              self._collection.remove(mongoId);
          } else if (!doc) {
            self._collection.insert(replace);
          } else {
            // XXX check that replace has no $ ops
            self._collection.update(mongoId, replace);
          }
          return;
        } else if (msg.msg === 'added') {
          if (doc) {
            throw new Error("Expected not to find a document already present for an add");
          }
          self._collection.insert(_.extend({_id: mongoId}, msg.fields));
        } else if (msg.msg === 'removed') {
          if (!doc)
            throw new Error("Expected to find a document already present for removed");
          self._collection.remove(mongoId);
        } else if (msg.msg === 'changed') {
          if (!doc)
            throw new Error("Expected to find a document to change");
          if (!_.isEmpty(msg.fields)) {
            var modifier = {};
            _.each(msg.fields, function (value, key) {
              if (value === undefined) {
                if (!modifier.$unset)
                  modifier.$unset = {};
                modifier.$unset[key] = 1;
              } else {
                if (!modifier.$set)
                  modifier.$set = {};
                modifier.$set[key] = value;
              }
            });
            self._collection.update(mongoId, modifier);
          }
        } else {
          throw new Error("I don't know how to deal with this message");
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
  if (Package.autopublish && !options._preventAutopublish && self._connection
      && self._connection.publish) {
    self._connection.publish(null, function () {
      return self.find();
    }, {is_auto: true});
  }
};

///
/// Main collection API
///


_.extend(Meteor.Collection.prototype, {

  _getFindSelector: function (args) {
    if (args.length == 0)
      return {};
    else
      return args[0];
  },

  _getFindOptions: function (args) {
    var self = this;
    if (args.length < 2) {
      return { transform: self._transform };
    } else {
      return _.extend({
        transform: self._transform
      }, args[1]);
    }
  },

  find: function (/* selector, options */) {
    // Collection.find() (return all docs) behaves differently
    // from Collection.find(undefined) (return 0 docs).  so be
    // careful about the length of arguments.
    var self = this;
    var argArray = _.toArray(arguments);
    return self._collection.find(self._getFindSelector(argArray),
                                 self._getFindOptions(argArray));
  },

  findOne: function (/* selector, options */) {
    var self = this;
    var argArray = _.toArray(arguments);
    return self._collection.findOne(self._getFindSelector(argArray),
                                    self._getFindOptions(argArray));
  }

});

Meteor.Collection._publishCursor = function (cursor, sub, collection) {
  var observeHandle = cursor.observeChanges({
    added: function (id, fields) {
      sub.added(collection, id, fields);
    },
    changed: function (id, fields) {
      sub.changed(collection, id, fields);
    },
    removed: function (id) {
      sub.removed(collection, id);
    }
  });

  // We don't call sub.ready() here: it gets called in livedata_server, after
  // possibly calling _publishCursor on multiple returned cursors.

  // register stop callback (expects lambda w/ no args).
  sub.onStop(function () {observeHandle.stop();});
};

// protect against dangerous selectors.  falsey and {_id: falsey} are both
// likely programmer error, and not what you want, particularly for destructive
// operations.  JS regexps don't serialize over DDP but can be trivially
// replaced by $regex.
Meteor.Collection._rewriteSelector = function (selector) {
  // shorthand -- scalars match _id
  if (LocalCollection._selectorIsId(selector))
    selector = {_id: selector};

  if (!selector || (('_id' in selector) && !selector._id))
    // can't match anything
    return {_id: Random.id()};

  var ret = {};
  _.each(selector, function (value, key) {
    // Mongo supports both {field: /foo/} and {field: {$regex: /foo/}}
    if (value instanceof RegExp) {
      ret[key] = convertRegexpToMongoSelector(value);
    } else if (value && value.$regex instanceof RegExp) {
      ret[key] = convertRegexpToMongoSelector(value.$regex);
      // if value is {$regex: /foo/, $options: ...} then $options
      // override the ones set on $regex.
      if (value.$options !== undefined)
        ret[key].$options = value.$options;
    }
    else if (_.contains(['$or','$and','$nor'], key)) {
      // Translate lower levels of $and/$or/$nor
      ret[key] = _.map(value, function (v) {
        return Meteor.Collection._rewriteSelector(v);
      });
    } else {
      ret[key] = value;
    }
  });
  return ret;
};

// convert a JS RegExp object to a Mongo {$regex: ..., $options: ...}
// selector
var convertRegexpToMongoSelector = function (regexp) {
  check(regexp, RegExp); // safety belt

  var selector = {$regex: regexp.source};
  var regexOptions = '';
  // JS RegExp objects support 'i', 'm', and 'g'. Mongo regex $options
  // support 'i', 'm', 'x', and 's'. So we support 'i' and 'm' here.
  if (regexp.ignoreCase)
    regexOptions += 'i';
  if (regexp.multiline)
    regexOptions += 'm';
  if (regexOptions)
    selector.$options = regexOptions;

  return selector;
};

var throwIfSelectorIsNotId = function (selector, methodName) {
  if (!LocalCollection._selectorIsIdPerhapsAsObject(selector)) {
    throw new Meteor.Error(
      403, "Not permitted. Untrusted code may only " + methodName +
        " documents by ID.");
  }
};

// 'insert' immediately returns the inserted document's new _id.
// The others return values immediately if you are in a stub, an in-memory
// unmanaged collection, or a mongo-backed collection and you don't pass a
// callback. 'update' and 'remove' return the number of affected
// documents. 'upsert' returns an object with keys 'numberAffected' and, if an
// insert happened, 'insertedId'.
//
// Otherwise, the semantics are exactly like other methods: they take
// a callback as an optional last argument; if no callback is
// provided, they block until the operation is complete, and throw an
// exception if it fails; if a callback is provided, then they don't
// necessarily block, and they call the callback when they finish with error and
// result arguments.  (The insert method provides the document ID as its result;
// update and remove provide the number of affected docs as the result; upsert
// provides an object with numberAffected and maybe insertedId.)
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
    var insertId;
    var ret;

    if (args.length && args[args.length - 1] instanceof Function)
      callback = args.pop();

    if (name === "insert") {
      if (!args.length)
        throw new Error("insert requires an argument");
      // shallow-copy the document and generate an ID
      args[0] = _.extend({}, args[0]);
      if ('_id' in args[0]) {
        insertId = args[0]._id;
        if (!insertId || !(typeof insertId === 'string'
              || insertId instanceof Meteor.Collection.ObjectID))
          throw new Error("Meteor requires document _id fields to be non-empty strings or ObjectIDs");
      } else {
        insertId = args[0]._id = self._makeNewID();
      }
    } else {
      args[0] = Meteor.Collection._rewriteSelector(args[0]);

      if (name === "update") {
        // Mutate args but copy the original options object. We need to add
        // insertedId to options, but don't want to mutate the caller's options
        // object. We need to mutate `args` because we pass `args` into the
        // driver below.
        var options = args[2] = _.clone(args[2]) || {};
        if (options && typeof options !== "function" && options.upsert) {
          // set `insertedId` if absent.  `insertedId` is a Meteor extension.
          if (options.insertedId) {
            if (!(typeof options.insertedId === 'string'
                  || options.insertedId instanceof Meteor.Collection.ObjectID))
              throw new Error("insertedId must be string or ObjectID");
          } else {
            options.insertedId = self._makeNewID();
          }
        }
      }
    }

    // On inserts, always return the id that we generated; on all other
    // operations, just return the result from the collection.
    var chooseReturnValueFromCollectionResult = function (result) {
      if (name === "insert")
        return insertId;
      else
        return result;
    };

    var wrappedCallback;
    if (callback) {
      wrappedCallback = function (error, result) {
        callback(error, ! error && chooseReturnValueFromCollectionResult(result));
      };
    }

    if (self._connection && self._connection !== Meteor.server) {
      // just remote to another endpoint, propagate return value or
      // exception.

      var enclosing = DDP._CurrentInvocation.get();
      var alreadyInSimulation = enclosing && enclosing.isSimulation;

      if (Meteor.isClient && !wrappedCallback && ! alreadyInSimulation) {
        // Client can't block, so it can't report errors by exception,
        // only by callback. If they forget the callback, give them a
        // default one that logs the error, so they aren't totally
        // baffled if their writes don't work because their database is
        // down.
        // Don't give a default callback in simulation, because inside stubs we
        // want to return the results from the local collection immediately and
        // not force a callback.
        wrappedCallback = function (err) {
          if (err)
            Meteor._debug(name + " failed: " + (err.reason || err.stack));
        };
      }

      if (!alreadyInSimulation && name !== "insert") {
        // If we're about to actually send an RPC, we should throw an error if
        // this is a non-ID selector, because the mutation methods only allow
        // single-ID selectors. (If we don't throw here, we'll see flicker.)
        throwIfSelectorIsNotId(args[0], name);
      }

      ret = chooseReturnValueFromCollectionResult(
        self._connection.apply(self._prefix + name, args, wrappedCallback)
      );

    } else {
      // it's my collection.  descend into the collection object
      // and propagate any exception.
      args.push(wrappedCallback);
      try {
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.
        var queryRet = self._collection[name].apply(self._collection, args);
        ret = chooseReturnValueFromCollectionResult(queryRet);
      } catch (e) {
        if (callback) {
          callback(e);
          return null;
        }
        throw e;
      }
    }

    // both sync and async, unless we threw an exception, return ret
    // (new document ID for insert, num affected for update/remove, object with
    // numberAffected and maybe insertedId for upsert).
    return ret;
  };
});

Meteor.Collection.prototype.upsert = function (selector, modifier,
                                               options, callback) {
  var self = this;
  if (! callback && typeof options === "function") {
    callback = options;
    options = {};
  }
  return self.update(selector, modifier,
              _.extend({}, options, { _returnObject: true, upsert: true }),
              callback);
};

// We'll actually design an index API later. For now, we just pass through to
// Mongo's, but make it synchronous.
Meteor.Collection.prototype._ensureIndex = function (index, options) {
  var self = this;
  if (!self._collection._ensureIndex)
    throw new Error("Can only call _ensureIndex on server collections");
  self._collection._ensureIndex(index, options);
};
Meteor.Collection.prototype._dropIndex = function (index) {
  var self = this;
  if (!self._collection._dropIndex)
    throw new Error("Can only call _dropIndex on server collections");
  self._collection._dropIndex(index);
};
Meteor.Collection.prototype._dropCollection = function () {
  var self = this;
  if (!self._collection.dropCollection)
    throw new Error("Can only call _dropCollection on server collections");
  self._collection.dropCollection();
};
Meteor.Collection.prototype._createCappedCollection = function (byteSize) {
  var self = this;
  if (!self._collection._createCappedCollection)
    throw new Error("Can only call _createCappedCollection on server collections");
  self._collection._createCappedCollection(byteSize);
};

Meteor.Collection.ObjectID = LocalCollection._ObjectID;

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
    var VALID_KEYS = ['insert', 'update', 'remove', 'fetch', 'transform'];
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

        // If the transform is specified at all (including as 'null') in this
        // call, then take that; otherwise, take the transform from the
        // collection.
        if (options.transform === undefined) {
          options[name].transform = self._transform;  // already wrapped
        } else {
          options[name].transform = LocalCollection.wrapTransform(
            options.transform);
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

  // Insecure mode (default to allowing writes). Defaults to 'undefined' which
  // means insecure iff the insecure package is loaded. This property can be
  // overriden by tests or packages wishing to change insecure mode behavior of
  // their collections.
  self._insecure = undefined;

  self._validators = {
    insert: {allow: [], deny: []},
    update: {allow: [], deny: []},
    remove: {allow: [], deny: []},
    upsert: {allow: [], deny: []}, // dummy arrays; can't set these!
    fetch: [],
    fetchAllFields: false
  };

  if (!self._name)
    return; // anonymous collection

  // XXX Think about method namespacing. Maybe methods should be
  // "Meteor:Mongo:insert/NAME"?
  self._prefix = '/' + self._name + '/';

  // mutation methods
  if (self._connection) {
    var m = {};

    _.each(['insert', 'update', 'remove'], function (method) {
      m[self._prefix + method] = function (/* ... */) {
        // All the methods do their own validation, instead of using check().
        check(arguments, [Match.Any]);
        try {
          if (this.isSimulation) {

            // In a client simulation, you can do any mutation (even with a
            // complex selector).
            return self._collection[method].apply(
              self._collection, _.toArray(arguments));
          }

          // This is the server receiving a method call from the client.

          // We don't allow arbitrary selectors in mutations from the client: only
          // single-ID selectors.
          if (method !== 'insert')
            throwIfSelectorIsNotId(arguments[0], method);

          if (self._restricted) {
            // short circuit if there is no way it will pass.
            if (self._validators[method].allow.length === 0) {
              throw new Meteor.Error(
                403, "Access denied. No allow validators set on restricted " +
                  "collection for method '" + method + "'.");
            }

            var validatedMethodName =
                  '_validated' + method.charAt(0).toUpperCase() + method.slice(1);
            var argsWithUserId = [this.userId].concat(_.toArray(arguments));
            return self[validatedMethodName].apply(self, argsWithUserId);
          } else if (self._isInsecure()) {
            // In insecure mode, allow any mutation (with a simple selector).
            return self._collection[method].apply(self._collection,
                                                  _.toArray(arguments));
          } else {
            // In secure mode, if we haven't called allow or deny, then nothing
            // is permitted.
            throw new Meteor.Error(403, "Access denied");
          }
        } catch (e) {
          if (e.name === 'MongoError' || e.name === 'MinimongoError') {
            throw new Meteor.Error(409, e.toString());
          } else {
            throw e;
          }
        }
      };
    });
    // Minimongo on the server gets no stubs; instead, by default
    // it wait()s until its result is ready, yielding.
    // This matches the behavior of macromongo on the server better.
    if (Meteor.isClient || self._connection === Meteor.server)
      self._connection.methods(m);
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
    return !!Package.insecure;
  return self._insecure;
};

var docToValidate = function (validator, doc) {
  var ret = doc;
  if (validator.transform)
    ret = validator.transform(EJSON.clone(doc));
  return ret;
};

Meteor.Collection.prototype._validatedInsert = function(userId, doc) {
  var self = this;

  // call user validators.
  // Any deny returns true means denied.
  if (_.any(self._validators.insert.deny, function(validator) {
    return validator(userId, docToValidate(validator, doc));
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (_.all(self._validators.insert.allow, function(validator) {
    return !validator(userId, docToValidate(validator, doc));
  })) {
    throw new Meteor.Error(403, "Access denied");
  }

  self._collection.insert.call(self._collection, doc);
};

var transformDoc = function (validator, doc) {
  if (validator.transform)
    return validator.transform(doc);
  return doc;
};

// Simulate a mongo `update` operation while validating that the access
// control rules set by calls to `allow/deny` are satisfied. If all
// pass, rewrite the mongo operation to use $in to set the list of
// document ids to change ##ValidatedChange
Meteor.Collection.prototype._validatedUpdate = function(
    userId, selector, mutator, options) {
  var self = this;

  options = options || {};

  if (!LocalCollection._selectorIsIdPerhapsAsObject(selector))
    throw new Error("validated update should be of a single ID");

  // We don't support upserts because they don't fit nicely into allow/deny
  // rules.
  if (options.upsert)
    throw new Meteor.Error(403, "Access denied. Upserts not " +
                           "allowed in a restricted collection.");

  // compute modified fields
  var fields = [];
  _.each(mutator, function (params, op) {
    if (op.charAt(0) !== '$') {
      throw new Meteor.Error(
        403, "Access denied. In a restricted collection you can only update documents, not replace them. Use a Mongo update operator, such as '$set'.");
    } else if (!_.has(ALLOWED_UPDATE_OPERATIONS, op)) {
      throw new Meteor.Error(
        403, "Access denied. Operator " + op + " not allowed in a restricted collection.");
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

  var findOptions = {transform: null};
  if (!self._validators.fetchAllFields) {
    findOptions.fields = {};
    _.each(self._validators.fetch, function(fieldName) {
      findOptions.fields[fieldName] = 1;
    });
  }

  var doc = self._collection.findOne(selector, findOptions);
  if (!doc)  // none satisfied!
    return 0;

  var factoriedDoc;

  // call user validators.
  // Any deny returns true means denied.
  if (_.any(self._validators.update.deny, function(validator) {
    if (!factoriedDoc)
      factoriedDoc = transformDoc(validator, doc);
    return validator(userId,
                     factoriedDoc,
                     fields,
                     mutator);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (_.all(self._validators.update.allow, function(validator) {
    if (!factoriedDoc)
      factoriedDoc = transformDoc(validator, doc);
    return !validator(userId,
                      factoriedDoc,
                      fields,
                      mutator);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }

  // Back when we supported arbitrary client-provided selectors, we actually
  // rewrote the selector to include an _id clause before passing to Mongo to
  // avoid races, but since selector is guaranteed to already just be an ID, we
  // don't have to any more.

  return self._collection.update.call(
    self._collection, selector, mutator, options);
};

// Only allow these operations in validated updates. Specifically
// whitelist operations, rather than blacklist, so new complex
// operations that are added aren't automatically allowed. A complex
// operation is one that does more than just modify its target
// field. For now this contains all update operations except '$rename'.
// http://docs.mongodb.org/manual/reference/operators/#update
var ALLOWED_UPDATE_OPERATIONS = {
  $inc:1, $set:1, $unset:1, $addToSet:1, $pop:1, $pullAll:1, $pull:1,
  $pushAll:1, $push:1, $bit:1
};

// Simulate a mongo `remove` operation while validating access control
// rules. See #ValidatedChange
Meteor.Collection.prototype._validatedRemove = function(userId, selector) {
  var self = this;

  var findOptions = {transform: null};
  if (!self._validators.fetchAllFields) {
    findOptions.fields = {};
    _.each(self._validators.fetch, function(fieldName) {
      findOptions.fields[fieldName] = 1;
    });
  }

  var doc = self._collection.findOne(selector, findOptions);
  if (!doc)
    return 0;

  // call user validators.
  // Any deny returns true means denied.
  if (_.any(self._validators.remove.deny, function(validator) {
    return validator(userId, transformDoc(validator, doc));
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (_.all(self._validators.remove.allow, function(validator) {
    return !validator(userId, transformDoc(validator, doc));
  })) {
    throw new Meteor.Error(403, "Access denied");
  }

  // Back when we supported arbitrary client-provided selectors, we actually
  // rewrote the selector to {_id: {$in: [ids that we found]}} before passing to
  // Mongo to avoid races, but since selector is guaranteed to already just be
  // an ID, we don't have to any more.

  return self._collection.remove.call(self._collection, selector);
};
