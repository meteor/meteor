RedisSingletons = {};
RedisSingletons._collections = {};

// options.connection, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection
Meteor.RedisCollection = function (name, options) {
  var self = this;
  if (! (self instanceof Meteor.RedisCollection))
    throw new Error('use "new" to construct a Meteor.RedisCollection');

  if (!name && (name !== null)) {
    Meteor._debug("Warning: creating anonymous collection. It will not be " +
                  "saved or synchronized over the network. (Pass null for " +
                  "the collection name to turn off this warning.)");
    name = null;
  }

  if (name !== null && typeof name !== "string") {
    throw new Error(
      "First argument to new Meteor.RedisCollection must be a string or null");
  }

  if (name !== null) {
    if (_.has(RedisSingletons._collections, name)) {
      return RedisSingletons._collections[name];
    }
  }
  options = _.extend({
    connection: undefined,
//    idGeneration: 'STRING',
//    transform: null,
    _driver: undefined,
    _preventAutopublish: false
  }, options);

//  switch (options.idGeneration) {
//  case 'MONGO':
//    self._makeNewID = function () {
//      var src = name ? DDP.randomStream('/collection/' + name) : Random;
//      return new Meteor.RedisCollection.ObjectID(src.hexString(24));
//    };
//    break;
//  case 'STRING':
//  default:
    self._makeNewID = function () {
      var src = name ? DDP.randomStream('/collection/' + name) : Random;
      return src.id();
    };
//    break;
//  }

//  if (options.transform) {
//    throw Exception("transform not supported for redis");
//    //self._transform = LocalCollection.wrapTransform(options.transform);
//  } else {
//    self._transform = null;
//  }

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
        typeof RedisInternals !== "undefined" &&
        RedisInternals.defaultRemoteCollectionDriver) {
      options._driver = RedisInternals.defaultRemoteCollectionDriver();
    } else {
      options._driver = LocalCollectionDriver;
    }
  }

  self._collection = options._driver.open(name, self._connection);
  self._name = name || "";

  if (self._connection && self._connection.registerStore) {
    // OK, we're going to be a slave, replicating some remote
    // database, except possibly with some temporary divergence while
    // we have unacknowledged RPC's.
    var ok = self._connection.registerStore(name, {
      // Called at the beginning of a batch of updates. batchSize is the number
      // of update calls to expect.
      beginUpdate: function (batchSize, reset) {
        if (batchSize > 1 || reset) {
          self._collection.pauseObservers();
        }

        if (reset)
          self._collection._drop();
      },

      // Apply an update.
      // XXX better specify this interface (not in terms of a wire message)?
      update: function (msg) {
        var key = msg.id;
        var doc = self._collection._get(key);

        // Is this a "replace the whole doc" message coming from the quiescence
        // of method writes to an object? (Note that 'undefined' is a valid
        // value meaning "remove it".)
        if (msg.msg === 'replace') {
          var replace = msg.replace;
          if (!replace) {
            if (doc)
              self._collection._remove(key);
          } else {
            self._collection._set(key, replace.value);
          }
        } else if (msg.msg === 'added') {
          if (doc) {
            throw new Error("Expected not to find a document already present for an add");
          }
          self._collection._set(key, msg.fields.value);
        } else if (msg.msg === 'removed') {
          if (!doc)
            throw new Error("Expected to find a document already present for removed");
          self._collection._remove(key);
        } else if (msg.msg === 'changed') {
          if (!doc)
            throw new Error("Expected to find a document to change");
          if (!_.isEmpty(msg.fields)) {
            self._collection._set(key, msg.fields.value);
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

  if (name) {
    RedisSingletons._collections[name] = self;
  }
};

///
/// Main collection API
///


_.extend(Meteor.RedisCollection.prototype, {

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
      check(args[1], Match.Optional(Match.ObjectIncluding({
        fields: Match.Optional(Match.OneOf(Object, undefined)),
        sort: Match.Optional(Match.OneOf(Object, Array, undefined)),
        limit: Match.Optional(Match.OneOf(Number, undefined)),
        skip: Match.Optional(Match.OneOf(Number, undefined))
     })));

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
  },

  observe: function (observer) {
    var self = this;
    return self._collection.observe(observer);
  }

});

Meteor.RedisCollection._publishCursor = function (cursor, sub, collection) {
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
Meteor.RedisCollection._rewriteSelector = function (selector) {
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
        return Meteor.RedisCollection._rewriteSelector(v);
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
  Meteor.RedisCollection.prototype[name] = function (/* arguments */) {
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
        if (!insertId || !(typeof insertId === 'string'))
          throw new Error("Meteor requires document _id fields to be non-empty strings");
      } else {
        var generateId = true;
        // Don't generate the id if we're the client and the 'outermost' call
        // This optimization saves us passing both the randomSeed and the id
        // Passing both is redundant.
        if (self._connection && self._connection !== Meteor.server) {
          var enclosing = DDP._CurrentInvocation.get();
          if (!enclosing) {
            generateId = false;
          }
        }
        if (generateId) {
          insertId = args[0]._id = self._makeNewID();
        }
      }
    } else {
      args[0] = Meteor.RedisCollection._rewriteSelector(args[0]);

      if (name === "update") {
        // Mutate args but copy the original options object. We need to add
        // insertedId to options, but don't want to mutate the caller's options
        // object. We need to mutate `args` because we pass `args` into the
        // driver below.
        var options = args[2] = _.clone(args[2]) || {};
        if (options && typeof options !== "function" && options.upsert) {
          // set `insertedId` if absent.  `insertedId` is a Meteor extension.
          if (options.insertedId) {
            if (!(typeof options.insertedId === 'string'))
              throw new Error("insertedId must be string");
          } else {
            options.insertedId = self._makeNewID();
          }
        }
      }
    }

    // On inserts, always return the id that we generated; on all other
    // operations, just return the result from the collection.
    var chooseReturnValueFromCollectionResult = function (result) {
      if (name === "insert") {
        if (!insertId && result) {
          insertId = result;
        }
        return insertId;
      } else {
        return result;
      }
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
        self._connection.apply(self._prefix + name, args, {returnStubValue: true}, wrappedCallback)
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

// Returns a Cursor
Meteor.RedisCollection.prototype.matching = function (pattern) {
  var self = this;
  return self._collection.matching(pattern);
};

_.each(['set', 'get', 'incrby', 'hgetall', 'hmset', 'hincrby', 'del', '_keys_hgetall'], function (name) {
  Meteor.RedisCollection.prototype[name] = function (/* arguments */) {
    var self = this;
    var args = _.toArray(arguments);

    // if this is a read-only command, run it synchronously against the local
    // cache miniredis.
    if (_.contains(['get', 'hgetall', '_keys_hgetall'], name))
      return self._collection[name].apply(self._collection, args);

    var callback;

    if (args.length && args[args.length - 1] instanceof Function)
      callback = args.pop();
    if (self._connection && self._connection !== Meteor.server) {
      // just remote to another endpoint, propagate return value or
      // exception.

      var enclosing = DDP._CurrentInvocation.get();
      var alreadyInSimulation = enclosing && enclosing.isSimulation;

      if (Meteor.isClient && !callback && ! alreadyInSimulation) {
        // Client can't block, so it can't report errors by exception,
        // only by callback. If they forget the callback, give them a
        // default one that logs the error, so they aren't totally
        // baffled if their writes don't work because their database is
        // down.
        // Don't give a default callback in simulation, because inside stubs we
        // want to return the results from the local collection immediately and
        // not force a callback.
        callback = function (err) {
          if (err)
            Meteor._debug("Exec of command " + name + " failed: " +
                          (err.reason || err.stack));
        };
      }

      ret = self._connection.apply(self._prefix + 'exec',
                                   [name].concat(args),
                                   {returnStubValue: true}, callback);

    } else {
      // it's my collection.  descend into the collection object
      // and propagate any exception.
      args.push(callback);
      try {
        // If the user provided a callback and the collection implements this
        // operation asynchronously, then queryRet will be undefined, and the
        // result will be returned through the callback instead.
        ret = self._collection[name].apply(self._collection, args);
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

Meteor.RedisCollection.prototype.upsert = function (selector, modifier,
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
Meteor.RedisCollection.prototype._ensureIndex = function (index, options) {
  var self = this;
  if (!self._collection._ensureIndex)
    throw new Error("Can only call _ensureIndex on server collections");
  self._collection._ensureIndex(index, options);
};
Meteor.RedisCollection.prototype._dropIndex = function (index) {
  var self = this;
  if (!self._collection._dropIndex)
    throw new Error("Can only call _dropIndex on server collections");
  self._collection._dropIndex(index);
};
Meteor.RedisCollection.prototype._dropCollection = function () {
  var self = this;
  if (!self._collection.dropCollection)
    throw new Error("Can only call _dropCollection on server collections");
  self._collection.dropCollection();
};
Meteor.RedisCollection.prototype._createCappedCollection = function (byteSize) {
  var self = this;
  if (!self._collection._createCappedCollection)
    throw new Error("Can only call _createCappedCollection on server collections");
  self._collection._createCappedCollection(byteSize);
};

//Meteor.RedisCollection.ObjectID = LocalCollection._ObjectID;

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
    var VALID_KEYS = ['exec'];
    _.each(_.keys(options), function (key) {
      if (!_.contains(VALID_KEYS, key))
        throw new Error(allowOrDeny + ": Invalid key: " + key);
    });

    var self = this;
    self._restricted = true;

    _.each(['exec'], function (name) {
      if (options[name]) {
        if (!(options[name] instanceof Function)) {
          throw new Error(allowOrDeny + ": Value for `" + name + "` must be a function");
        }
        self._validators[name][allowOrDeny].push(options[name]);
      }
    });
  };

  Meteor.RedisCollection.prototype.allow = function(options) {
    addValidator.call(this, 'allow', options);
  };
  Meteor.RedisCollection.prototype.deny = function(options) {
    addValidator.call(this, 'deny', options);
  };
})();


Meteor.RedisCollection.prototype._defineMutationMethods = function() {
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
    exec: {allow: [], deny: []}
  };

  if (!self._name)
    return; // anonymous collection

  self._prefix = '/' + self._name + '/';

  // mutation methods
  if (self._connection) {
    var m = {};

    m[self._prefix + 'exec'] = function (/* ... */) {
      // All the methods do their own validation, instead of using check().
      var args = _.toArray(arguments);
      var method = args[0];
      args = _.rest(args);
      check(method, String); // name of the redis method to execute
      check(args, [String]); // args to the redis method

      try {
        if (this.isSimulation) {
          // In a client simulation, you can do any mutation.
          return self._collection[method].apply(
            self._collection, args);
        }

        // This is the server receiving a method call from the client.

        if (self._restricted) {
          // short circuit if there is no way it will pass.
          if (self._validators[method].allow.length === 0) {
            throw new Meteor.Error(
              403, "Access denied. No allow validators set on restricted " +
                "Redis store.");
          }

          var validatedMethodName = '_validatedExec';
          return self[validatedMethodName].call(self, userId, method, args);
        } else if (self._isInsecure()) {
          // In insecure mode, allow any mutation.
          return self._collection[method].apply(self._collection, args);
        } else {
          // In secure mode, if we haven't called allow or deny, then nothing
          // is permitted.
          throw new Meteor.Error(403, "Access denied");
        }
      } catch (e) {
        if (e.name === 'RedisError' || e.name === 'MiniredisError') {
          throw new Meteor.Error(409, e.toString());
        } else {
          throw e;
        }
      }
    };

    if (Meteor.isClient || self._connection === Meteor.server)
      self._connection.methods(m);
  }
};

Meteor.RedisCollection.prototype._isInsecure = function () {
  var self = this;
  if (self._insecure === undefined)
    return !!Package.insecure;
  return self._insecure;
};

Meteor.RedisCollection.prototype._validatedExec =
  function (userId, method, args) {
  var self = this;

  // call user validators.
  // Any deny returns true means denied.
  if (_.any(self._validators.exec.deny, function(validator) {
    return validator(userId, method, args);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }
  // Any allow returns true means proceed. Throw error if they all fail.
  if (_.all(self._validators.exec.allow, function(validator) {
    return !validator(userId, method, args);
  })) {
    throw new Meteor.Error(403, "Access denied");
  }

  var Future = Npm.require('fibers/future');

  var f = new Future;
  args.push(f.resolver());
  self._collection[method].apply(self._collection, args);
  return f.wait();
};

