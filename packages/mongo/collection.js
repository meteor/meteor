// options.connection, if given, is a LivedataClient or LivedataServer
// XXX presently there is no way to destroy/clean up a Collection

/**
 * @summary Namespace for MongoDB-related items
 * @namespace
 */
Mongo = {};

/**
 * @summary Constructor for a Collection
 * @locus Anywhere
 * @instancename collection
 * @class
 * @param {String} name The name of the collection.  If null, creates an unmanaged (unsynchronized) local collection.
 * @param {Object} [options]
 * @param {Object} options.connection The server connection that will manage this collection. Uses the default connection if not specified.  Pass the return value of calling [`DDP.connect`](#ddp_connect) to specify a different server. Pass `null` to specify no connection. Unmanaged (`name` is null) collections cannot specify a connection.
 * @param {String} options.idGeneration The method of generating the `_id` fields of new documents in this collection.  Possible values:

 - **`'STRING'`**: random strings
 - **`'MONGO'`**:  random [`Mongo.ObjectID`](#mongo_object_id) values

The default id generation technique is `'STRING'`.
 * @param {Function} options.transform An optional transformation function. Documents will be passed through this function before being returned from `fetch` or `findOne`, and before being passed to callbacks of `observe`, `map`, `forEach`, `allow`, and `deny`. Transforms are *not* applied for the callbacks of `observeChanges` or to cursors returned from publish functions.
 */
Mongo.Collection = function (name, options) {
  var self = this;
  if (! (self instanceof Mongo.Collection))
    throw new Error('use "new" to construct a Mongo.Collection');

  if (!name && (name !== null)) {
    Meteor._debug("Warning: creating anonymous collection. It will not be " +
                  "saved or synchronized over the network. (Pass null for " +
                  "the collection name to turn off this warning.)");
    name = null;
  }

  if (name !== null && typeof name !== "string") {
    throw new Error(
      "First argument to new Mongo.Collection must be a string or null");
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
      var src = name
            ? DDP.randomStream('/collection/' + name)
            : Random.insecure;
      return new Mongo.ObjectID(src.hexString(24));
    };
    break;
  case 'STRING':
  default:
    self._makeNewID = function () {
      var src = name
            ? DDP.randomStream('/collection/' + name)
            : Random.insecure;
      return src.id();
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
    // XXX This check assumes that webapp is loaded so that Meteor.server !==
    // null. We should fully support the case of "want to use a Mongo-backed
    // collection from Node code without webapp", but we don't yet.
    // #MeteorServerNull
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
  self._driver = options._driver;

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
        var mongoId = MongoID.idParse(msg.id);
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
      },

      // Used to preserve current versions of documents across a store reset.
      getDoc: function(id) {
        return self.findOne(id);
      },
    });

    if (!ok)
      throw new Error("There is already a collection named '" + name + "'");
  }

  // XXX don't define these until allow or deny is actually used for this
  // collection. Could be hard if the security rules are only defined on the
  // server.
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


_.extend(Mongo.Collection.prototype, {

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

  /**
   * @summary Find the documents in a collection that match the selector.
   * @locus Anywhere
   * @method find
   * @memberOf Mongo.Collection
   * @instance
   * @param {MongoSelector} [selector] A query describing the documents to find
   * @param {Object} [options]
   * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)
   * @param {Number} options.skip Number of results to skip at the beginning
   * @param {Number} options.limit Maximum number of results to return
   * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
   * @param {Boolean} options.reactive (Client only) Default `true`; pass `false` to disable reactivity
   * @param {Function} options.transform Overrides `transform` on the  [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
   * @returns {Mongo.Cursor}
   */
  find: function (/* selector, options */) {
    // Collection.find() (return all docs) behaves differently
    // from Collection.find(undefined) (return 0 docs).  so be
    // careful about the length of arguments.
    var self = this;
    var argArray = _.toArray(arguments);
    return self._collection.find(self._getFindSelector(argArray),
                                 self._getFindOptions(argArray));
  },

  /**
   * @summary Finds the first document that matches the selector, as ordered by sort and skip options.
   * @locus Anywhere
   * @method findOne
   * @memberOf Mongo.Collection
   * @instance
   * @param {MongoSelector} [selector] A query describing the documents to find
   * @param {Object} [options]
   * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)
   * @param {Number} options.skip Number of results to skip at the beginning
   * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
   * @param {Boolean} options.reactive (Client only) Default true; pass false to disable reactivity
   * @param {Function} options.transform Overrides `transform` on the [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
   * @returns {Object}
   */
  findOne: function (/* selector, options */) {
    var self = this;
    var argArray = _.toArray(arguments);
    return self._collection.findOne(self._getFindSelector(argArray),
                                    self._getFindOptions(argArray));
  }

});

Mongo.Collection._publishCursor = function (cursor, sub, collection) {
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

  // return the observeHandle in case it needs to be stopped early
  return observeHandle;
};

// protect against dangerous selectors.  falsey and {_id: falsey} are both
// likely programmer error, and not what you want, particularly for destructive
// operations.  JS regexps don't serialize over DDP but can be trivially
// replaced by $regex.
Mongo.Collection._rewriteSelector = function (selector) {
  // shorthand -- scalars match _id
  if (LocalCollection._selectorIsId(selector))
    selector = {_id: selector};

  if (_.isArray(selector)) {
    // This is consistent with the Mongo console itself; if we don't do this
    // check passing an empty array ends up selecting all items
    throw new Error("Mongo selector can't be an array.");
  }

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
        return Mongo.Collection._rewriteSelector(v);
      });
    } else {
      ret[key] = value;
    }
  });
  return ret;
};

// convert a JS RegExp object to a Mongo {$regex: ..., $options: ...}
// selector
function convertRegexpToMongoSelector(regexp) {
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

/**
 * @summary Insert a document in the collection.  Returns its unique _id.
 * @locus Anywhere
 * @method  insert
 * @memberOf Mongo.Collection
 * @instance
 * @param {Object} doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
 * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the _id as the second.
 */
Mongo.Collection.prototype.insert = function insert(doc, callback) {
  // Make sure we were passed a document to insert
  if (!doc) {
    throw new Error("insert requires an argument");
  }

  // Shallow-copy the document and possibly generate an ID
  doc = _.extend({}, doc);

  if ('_id' in doc) {
    if (!doc._id || !(typeof doc._id === 'string'
          || doc._id instanceof Mongo.ObjectID)) {
      throw new Error("Meteor requires document _id fields to be non-empty strings or ObjectIDs");
    }
  } else {
    let generateId = true;

    // Don't generate the id if we're the client and the 'outermost' call
    // This optimization saves us passing both the randomSeed and the id
    // Passing both is redundant.
    if (this._isRemoteCollection()) {
      const enclosing = DDP._CurrentInvocation.get();
      if (!enclosing) {
        generateId = false;
      }
    }

    if (generateId) {
      doc._id = this._makeNewID();
    }
  }

  // On inserts, always return the id that we generated; on all other
  // operations, just return the result from the collection.
  var chooseReturnValueFromCollectionResult = function (result) {
    if (doc._id) {
      return doc._id;
    }

    // XXX what is this for??
    // It's some iteraction between the callback to _callMutatorMethod and
    // the return value conversion
    doc._id = result;

    return result;
  };

  const wrappedCallback = wrapCallback(
    callback, chooseReturnValueFromCollectionResult);

  if (this._isRemoteCollection()) {
    const result = this._callMutatorMethod("insert", [doc], wrappedCallback);
    return chooseReturnValueFromCollectionResult(result);
  }

  // it's my collection.  descend into the collection object
  // and propagate any exception.
  try {
    // If the user provided a callback and the collection implements this
    // operation asynchronously, then queryRet will be undefined, and the
    // result will be returned through the callback instead.
    const result = this._collection.insert(doc, wrappedCallback);
    return chooseReturnValueFromCollectionResult(result);
  } catch (e) {
    if (callback) {
      callback(e);
      return null;
    }
    throw e;
  }
}

/**
 * @summary Modify one or more documents in the collection. Returns the number of affected documents.
 * @locus Anywhere
 * @method update
 * @memberOf Mongo.Collection
 * @instance
 * @param {MongoSelector} selector Specifies which documents to modify
 * @param {MongoModifier} modifier Specifies how to modify the documents
 * @param {Object} [options]
 * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
 * @param {Boolean} options.upsert True to insert a document if no matching documents are found.
 * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
 */
Mongo.Collection.prototype.update = function update(selector, modifier, ...optionsAndCallback) {
  const callback = popCallbackFromArgs(optionsAndCallback);

  selector = Mongo.Collection._rewriteSelector(selector);

  // We've already popped off the callback, so we are left with an array
  // of one or zero items
  const options = _.clone(optionsAndCallback[0]) || {};
  if (options && options.upsert) {
    // set `insertedId` if absent.  `insertedId` is a Meteor extension.
    if (options.insertedId) {
      if (!(typeof options.insertedId === 'string'
            || options.insertedId instanceof Mongo.ObjectID))
        throw new Error("insertedId must be string or ObjectID");
    } else if (! selector._id) {
      options.insertedId = this._makeNewID();
    }
  }

  const wrappedCallback = wrapCallback(callback);

  if (this._isRemoteCollection()) {
    const args = [
      selector,
      modifier,
      options
    ];

    return this._callMutatorMethod("update", args, wrappedCallback);
  }

  // it's my collection.  descend into the collection object
  // and propagate any exception.
  try {
    // If the user provided a callback and the collection implements this
    // operation asynchronously, then queryRet will be undefined, and the
    // result will be returned through the callback instead.
    return this._collection.update(
      selector, modifier, options, wrappedCallback);
  } catch (e) {
    if (callback) {
      callback(e);
      return null;
    }
    throw e;
  }
}

/**
 * @summary Remove documents from the collection
 * @locus Anywhere
 * @method remove
 * @memberOf Mongo.Collection
 * @instance
 * @param {MongoSelector} selector Specifies which documents to remove
 * @param {Function} [callback] Optional.  If present, called with an error object as its argument.
 */
Mongo.Collection.prototype.remove = function remove(selector, callback) {
  selector = Mongo.Collection._rewriteSelector(selector);

  const wrappedCallback = wrapCallback(callback);

  if (this._isRemoteCollection()) {
    return this._callMutatorMethod("remove", [selector], wrappedCallback);
  }

  // it's my collection.  descend into the collection object
  // and propagate any exception.
  try {
    // If the user provided a callback and the collection implements this
    // operation asynchronously, then queryRet will be undefined, and the
    // result will be returned through the callback instead.
    return this._collection.remove(selector, wrappedCallback);
  } catch (e) {
    if (callback) {
      callback(e);
      return null;
    }
    throw e;
  }
};

// Determine if this collection is simply a minimongo representation of a real
// database on another server
Mongo.Collection.prototype._isRemoteCollection = function _isRemoteCollection() {
  // XXX see #MeteorServerNull
  return this._connection && this._connection !== Meteor.server;
}

// Convert the callback to not return a result if there is an error
function wrapCallback(callback, convertResult) {
  if (!callback) {
    return;
  }

  // If no convert function was passed in, just use a "blank function"
  convertResult = convertResult || _.identity;

  return (error, result) => {
    callback(error, ! error && convertResult(result));
  };
}

/**
 * @summary Modify one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified)  and `insertedId` (the unique _id of the document that was inserted, if any).
 * @locus Anywhere
 * @param {MongoSelector} selector Specifies which documents to modify
 * @param {MongoModifier} modifier Specifies how to modify the documents
 * @param {Object} [options]
 * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
 * @param {Function} [callback] Optional.  If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
 */
Mongo.Collection.prototype.upsert = function upsert(
    selector, modifier, options, callback) {
  if (! callback && typeof options === "function") {
    callback = options;
    options = {};
  }

  const updateOptions = _.extend({}, options, {
    _returnObject: true,
    upsert: true
  });

  return this.update(selector, modifier, updateOptions, callback);
};

// We'll actually design an index API later. For now, we just pass through to
// Mongo's, but make it synchronous.
Mongo.Collection.prototype._ensureIndex = function (index, options) {
  var self = this;
  if (!self._collection._ensureIndex)
    throw new Error("Can only call _ensureIndex on server collections");
  self._collection._ensureIndex(index, options);
};
Mongo.Collection.prototype._dropIndex = function (index) {
  var self = this;
  if (!self._collection._dropIndex)
    throw new Error("Can only call _dropIndex on server collections");
  self._collection._dropIndex(index);
};
Mongo.Collection.prototype._dropCollection = function () {
  var self = this;
  if (!self._collection.dropCollection)
    throw new Error("Can only call _dropCollection on server collections");
  self._collection.dropCollection();
};
Mongo.Collection.prototype._createCappedCollection = function (byteSize, maxDocuments) {
  var self = this;
  if (!self._collection._createCappedCollection)
    throw new Error("Can only call _createCappedCollection on server collections");
  self._collection._createCappedCollection(byteSize, maxDocuments);
};

/**
 * @summary Returns the [`Collection`](http://mongodb.github.io/node-mongodb-native/1.4/api-generated/collection.html) object corresponding to this collection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
 * @locus Server
 */
Mongo.Collection.prototype.rawCollection = function () {
  var self = this;
  if (! self._collection.rawCollection) {
    throw new Error("Can only call rawCollection on server collections");
  }
  return self._collection.rawCollection();
};

/**
 * @summary Returns the [`Db`](http://mongodb.github.io/node-mongodb-native/1.4/api-generated/db.html) object corresponding to this collection's database connection from the [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
 * @locus Server
 */
Mongo.Collection.prototype.rawDatabase = function () {
  var self = this;
  if (! (self._driver.mongo && self._driver.mongo.db)) {
    throw new Error("Can only call rawDatabase on server collections");
  }
  return self._driver.mongo.db;
};


/**
 * @summary Create a Mongo-style `ObjectID`.  If you don't specify a `hexString`, the `ObjectID` will generated randomly (not using MongoDB's ID construction rules).
 * @locus Anywhere
 * @class
 * @param {String} [hexString] Optional.  The 24-character hexadecimal contents of the ObjectID to create
 */
Mongo.ObjectID = MongoID.ObjectID;

/**
 * @summary To create a cursor, use find. To access the documents in a cursor, use forEach, map, or fetch.
 * @class
 * @instanceName cursor
 */
Mongo.Cursor = LocalCollection.Cursor;

/**
 * @deprecated in 0.9.1
 */
Mongo.Collection.Cursor = Mongo.Cursor;

/**
 * @deprecated in 0.9.1
 */
Mongo.Collection.ObjectID = Mongo.ObjectID;

/**
 * @deprecated in 0.9.1
 */
Meteor.Collection = Mongo.Collection;

// Allow deny stuff is now in the allow-deny package
_.extend(Meteor.Collection.prototype, AllowDeny.CollectionPrototype);

function popCallbackFromArgs(args) {
  // Pull off any callback (or perhaps a 'callback' variable that was passed
  // in undefined, like how 'upsert' does it).
  if (args.length &&
      (args[args.length - 1] === undefined ||
       args[args.length - 1] instanceof Function)) {
    return args.pop();
  }
}
