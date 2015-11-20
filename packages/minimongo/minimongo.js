// XXX type checking on selectors (graceful error if malformed)

// LocalCollection: a set of documents that supports queries and modifiers.

// Cursor: a specification for a particular subset of documents, w/
// a defined order, limit, and offset.  creating a Cursor with LocalCollection.find(),

// ObserveHandle: the return value of a live query.

LocalCollection = function (name) {
  var self = this;
  self.name = name;
  // _id -> document (also containing id)
  self._docs = new LocalCollection._IdMap;

  self._observeQueue = new Meteor._SynchronousQueue();

  self.next_qid = 1; // live query id generator

  // qid -> live query object. keys:
  //  ordered: bool. ordered queries have addedBefore/movedBefore callbacks.
  //  results: array (ordered) or object (unordered) of current results
  //    (aliased with self._docs!)
  //  resultsSnapshot: snapshot of results. null if not paused.
  //  cursor: Cursor object for the query.
  //  selector, sorter, (callbacks): functions
  self.queries = {};

  // null if not saving originals; an IdMap from id to original document value if
  // saving originals. See comments before saveOriginals().
  self._savedOriginals = null;

  // True when observers are paused and we should not send callbacks.
  self.paused = false;
};

Minimongo = {};

// Object exported only for unit testing.
// Use it to export private functions to test in Tinytest.
MinimongoTest = {};

MinimongoError = function (message) {
  var e = new Error(message);
  e.name = "MinimongoError";
  return e;
};


// options may include sort, skip, limit, reactive
// sort may be any of these forms:
//     {a: 1, b: -1}
//     [["a", "asc"], ["b", "desc"]]
//     ["a", ["b", "desc"]]
//   (in the first form you're beholden to key enumeration order in
//   your javascript VM)
//
// reactive: if given, and false, don't register with Tracker (default
// is true)
//
// XXX possibly should support retrieving a subset of fields? and
// have it be a hint (ignored on the client, when not copying the
// doc?)
//
// XXX sort does not yet support subkeys ('a.b') .. fix that!
// XXX add one more sort form: "key"
// XXX tests
LocalCollection.prototype.find = function (selector, options) {
  // default syntax for everything is to omit the selector argument.
  // but if selector is explicitly passed in as false or undefined, we
  // want a selector that matches nothing.
  if (arguments.length === 0)
    selector = {};

  return new LocalCollection.Cursor(this, selector, options);
};

// don't call this ctor directly.  use LocalCollection.find().

LocalCollection.Cursor = function (collection, selector, options) {
  var self = this;
  if (!options) options = {};

  self.collection = collection;
  self.sorter = null;
  self.matcher = new Minimongo.Matcher(selector);

  if (LocalCollection._selectorIsId(selector)) {
    // stash for fast path
    self._selectorId = selector;
  } else if (LocalCollection._selectorIsIdPerhapsAsObject(selector)) {
    // also do the fast path for { _id: idString }
    self._selectorId = selector._id;
  } else {
    self._selectorId = undefined;
    if (self.matcher.hasGeoQuery() || options.sort) {
      self.sorter = new Minimongo.Sorter(options.sort || [],
                                         { matcher: self.matcher });
    }
  }

  self.skip = options.skip;
  self.limit = options.limit;
  self.fields = options.fields;

  self._projectionFn = LocalCollection._compileProjection(self.fields || {});

  self._transform = LocalCollection.wrapTransform(options.transform);

  // by default, queries register w/ Tracker when it is available.
  if (typeof Tracker !== "undefined")
    self.reactive = (options.reactive === undefined) ? true : options.reactive;
};

// Since we don't actually have a "nextObject" interface, there's really no
// reason to have a "rewind" interface.  All it did was make multiple calls
// to fetch/map/forEach return nothing the second time.
// XXX COMPAT WITH 0.8.1
LocalCollection.Cursor.prototype.rewind = function () {
};

LocalCollection.prototype.findOne = function (selector, options) {
  if (arguments.length === 0)
    selector = {};

  // NOTE: by setting limit 1 here, we end up using very inefficient
  // code that recomputes the whole query on each update. The upside is
  // that when you reactively depend on a findOne you only get
  // invalidated when the found object changes, not any object in the
  // collection. Most findOne will be by id, which has a fast path, so
  // this might not be a big deal. In most cases, invalidation causes
  // the called to re-query anyway, so this should be a net performance
  // improvement.
  options = options || {};
  options.limit = 1;

  return this.find(selector, options).fetch()[0];
};

/**
 * @callback IterationCallback
 * @param {Object} doc
 * @param {Number} index
 */
/**
 * @summary Call `callback` once for each matching document, sequentially and synchronously.
 * @locus Anywhere
 * @method  forEach
 * @instance
 * @memberOf Mongo.Cursor
 * @param {IterationCallback} callback Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself.
 * @param {Any} [thisArg] An object which will be the value of `this` inside `callback`.
 */
LocalCollection.Cursor.prototype.forEach = function (callback, thisArg) {
  var self = this;

  var objects = self._getRawObjects({ordered: true});

  if (self.reactive) {
    self._depend({
      addedBefore: true,
      removed: true,
      changed: true,
      movedBefore: true});
  }

  _.each(objects, function (elt, i) {
    // This doubles as a clone operation.
    elt = self._projectionFn(elt);

    if (self._transform)
      elt = self._transform(elt);
    callback.call(thisArg, elt, i, self);
  });
};

LocalCollection.Cursor.prototype.getTransform = function () {
  return this._transform;
};

/**
 * @summary Map callback over all matching documents.  Returns an Array.
 * @locus Anywhere
 * @method map
 * @instance
 * @memberOf Mongo.Cursor
 * @param {IterationCallback} callback Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself.
 * @param {Any} [thisArg] An object which will be the value of `this` inside `callback`.
 */
LocalCollection.Cursor.prototype.map = function (callback, thisArg) {
  var self = this;
  var res = [];
  self.forEach(function (doc, index) {
    res.push(callback.call(thisArg, doc, index, self));
  });
  return res;
};

/**
 * @summary Return all matching documents as an Array.
 * @memberOf Mongo.Cursor
 * @method  fetch
 * @instance
 * @locus Anywhere
 * @returns {Object[]}
 */
LocalCollection.Cursor.prototype.fetch = function () {
  var self = this;
  var res = [];
  self.forEach(function (doc) {
    res.push(doc);
  });
  return res;
};

/**
 * @summary Returns the number of documents that match a query.
 * @memberOf Mongo.Cursor
 * @method  count
 * @instance
 * @locus Anywhere
 * @returns {Number}
 */
LocalCollection.Cursor.prototype.count = function () {
  var self = this;

  if (self.reactive)
    self._depend({added: true, removed: true},
                 true /* allow the observe to be unordered */);

  return self._getRawObjects({ordered: true}).length;
};

LocalCollection.Cursor.prototype._publishCursor = function (sub) {
  var self = this;
  if (! self.collection.name)
    throw new Error("Can't publish a cursor from a collection without a name.");
  var collection = self.collection.name;

  // XXX minimongo should not depend on mongo-livedata!
  if (! Package.mongo) {
    throw new Error("Can't publish from Minimongo without the `mongo` package.");
  }

  return Package.mongo.Mongo.Collection._publishCursor(self, sub, collection);
};

LocalCollection.Cursor.prototype._getCollectionName = function () {
  var self = this;
  return self.collection.name;
};

LocalCollection._observeChangesCallbacksAreOrdered = function (callbacks) {
  if (callbacks.added && callbacks.addedBefore)
    throw new Error("Please specify only one of added() and addedBefore()");
  return !!(callbacks.addedBefore || callbacks.movedBefore);
};

LocalCollection._observeCallbacksAreOrdered = function (callbacks) {
  if (callbacks.addedAt && callbacks.added)
    throw new Error("Please specify only one of added() and addedAt()");
  if (callbacks.changedAt && callbacks.changed)
    throw new Error("Please specify only one of changed() and changedAt()");
  if (callbacks.removed && callbacks.removedAt)
    throw new Error("Please specify only one of removed() and removedAt()");

  return !!(callbacks.addedAt || callbacks.movedTo || callbacks.changedAt
            || callbacks.removedAt);
};

// the handle that comes back from observe.
LocalCollection.ObserveHandle = function () {};

// options to contain:
//  * callbacks for observe():
//    - addedAt (document, atIndex)
//    - added (document)
//    - changedAt (newDocument, oldDocument, atIndex)
//    - changed (newDocument, oldDocument)
//    - removedAt (document, atIndex)
//    - removed (document)
//    - movedTo (document, oldIndex, newIndex)
//
// attributes available on returned query handle:
//  * stop(): end updates
//  * collection: the collection this query is querying
//
// iff x is a returned query handle, (x instanceof
// LocalCollection.ObserveHandle) is true
//
// initial results delivered through added callback
// XXX maybe callbacks should take a list of objects, to expose transactions?
// XXX maybe support field limiting (to limit what you're notified on)

_.extend(LocalCollection.Cursor.prototype, {
  /**
   * @summary Watch a query.  Receive callbacks as the result set changes.
   * @locus Anywhere
   * @memberOf Mongo.Cursor
   * @instance
   * @param {Object} callbacks Functions to call to deliver the result set as it changes
   */
  observe: function (options) {
    var self = this;
    return LocalCollection._observeFromObserveChanges(self, options);
  },

  /**
   * @summary Watch a query.  Receive callbacks as the result set changes.  Only the differences between the old and new documents are passed to the callbacks.
   * @locus Anywhere
   * @memberOf Mongo.Cursor
   * @instance
   * @param {Object} callbacks Functions to call to deliver the result set as it changes
   */
  observeChanges: function (options) {
    var self = this;

    var ordered = LocalCollection._observeChangesCallbacksAreOrdered(options);

    // there are several places that assume you aren't combining skip/limit with
    // unordered observe.  eg, update's EJSON.clone, and the "there are several"
    // comment in _modifyAndNotify
    // XXX allow skip/limit with unordered observe
    if (!options._allow_unordered && !ordered && (self.skip || self.limit))
      throw new Error("must use ordered observe (ie, 'addedBefore' instead of 'added') with skip or limit");

    if (self.fields && (self.fields._id === 0 || self.fields._id === false))
      throw Error("You may not observe a cursor with {fields: {_id: 0}}");

    var query = {
      matcher: self.matcher, // not fast pathed
      sorter: ordered && self.sorter,
      distances: (
        self.matcher.hasGeoQuery() && ordered && new LocalCollection._IdMap),
      resultsSnapshot: null,
      ordered: ordered,
      cursor: self,
      projectionFn: self._projectionFn
    };
    var qid;

    // Non-reactive queries call added[Before] and then never call anything
    // else.
    if (self.reactive) {
      qid = self.collection.next_qid++;
      self.collection.queries[qid] = query;
    }
    query.results = self._getRawObjects({
      ordered: ordered, distances: query.distances});
    if (self.collection.paused)
      query.resultsSnapshot = (ordered ? [] : new LocalCollection._IdMap);

    // wrap callbacks we were passed. callbacks only fire when not paused and
    // are never undefined
    // Filters out blacklisted fields according to cursor's projection.
    // XXX wrong place for this?

    // furthermore, callbacks enqueue until the operation we're working on is
    // done.
    var wrapCallback = function (f) {
      if (!f)
        return function () {};
      return function (/*args*/) {
        var context = this;
        var args = arguments;

        if (self.collection.paused)
          return;

        self.collection._observeQueue.queueTask(function () {
          f.apply(context, args);
        });
      };
    };
    query.added = wrapCallback(options.added);
    query.changed = wrapCallback(options.changed);
    query.removed = wrapCallback(options.removed);
    if (ordered) {
      query.addedBefore = wrapCallback(options.addedBefore);
      query.movedBefore = wrapCallback(options.movedBefore);
    }

    if (!options._suppress_initial && !self.collection.paused) {
      // XXX unify ordered and unordered interface
      var each = ordered
            ? _.bind(_.each, null, query.results)
            : _.bind(query.results.forEach, query.results);
      each(function (doc) {
        var fields = EJSON.clone(doc);

        delete fields._id;
        if (ordered)
          query.addedBefore(doc._id, self._projectionFn(fields), null);
        query.added(doc._id, self._projectionFn(fields));
      });
    }

    var handle = new LocalCollection.ObserveHandle;
    _.extend(handle, {
      collection: self.collection,
      stop: function () {
        if (self.reactive)
          delete self.collection.queries[qid];
      }
    });

    if (self.reactive && Tracker.active) {
      // XXX in many cases, the same observe will be recreated when
      // the current autorun is rerun.  we could save work by
      // letting it linger across rerun and potentially get
      // repurposed if the same observe is performed, using logic
      // similar to that of Meteor.subscribe.
      Tracker.onInvalidate(function () {
        handle.stop();
      });
    }
    // run the observe callbacks resulting from the initial contents
    // before we leave the observe.
    self.collection._observeQueue.drain();

    return handle;
  }
});

// Returns a collection of matching objects, but doesn't deep copy them.
//
// If ordered is set, returns a sorted array, respecting sorter, skip, and limit
// properties of the query.  if sorter is falsey, no sort -- you get the natural
// order.
//
// If ordered is not set, returns an object mapping from ID to doc (sorter, skip
// and limit should not be set).
//
// If ordered is set and this cursor is a $near geoquery, then this function
// will use an _IdMap to track each distance from the $near argument point in
// order to use it as a sort key. If an _IdMap is passed in the 'distances'
// argument, this function will clear it and use it for this purpose (otherwise
// it will just create its own _IdMap). The observeChanges implementation uses
// this to remember the distances after this function returns.
LocalCollection.Cursor.prototype._getRawObjects = function (options) {
  var self = this;
  options = options || {};

  // XXX use OrderedDict instead of array, and make IdMap and OrderedDict
  // compatible
  var results = options.ordered ? [] : new LocalCollection._IdMap;

  // fast path for single ID value
  if (self._selectorId !== undefined) {
    // If you have non-zero skip and ask for a single id, you get
    // nothing. This is so it matches the behavior of the '{_id: foo}'
    // path.
    if (self.skip)
      return results;

    var selectedDoc = self.collection._docs.get(self._selectorId);
    if (selectedDoc) {
      if (options.ordered)
        results.push(selectedDoc);
      else
        results.set(self._selectorId, selectedDoc);
    }
    return results;
  }

  // slow path for arbitrary selector, sort, skip, limit

  // in the observeChanges case, distances is actually part of the "query" (ie,
  // live results set) object.  in other cases, distances is only used inside
  // this function.
  var distances;
  if (self.matcher.hasGeoQuery() && options.ordered) {
    if (options.distances) {
      distances = options.distances;
      distances.clear();
    } else {
      distances = new LocalCollection._IdMap();
    }
  }

  self.collection._docs.forEach(function (doc, id) {
    var matchResult = self.matcher.documentMatches(doc);
    if (matchResult.result) {
      if (options.ordered) {
        results.push(doc);
        if (distances && matchResult.distance !== undefined)
          distances.set(id, matchResult.distance);
      } else {
        results.set(id, doc);
      }
    }
    // Fast path for limited unsorted queries.
    // XXX 'length' check here seems wrong for ordered
    if (self.limit && !self.skip && !self.sorter &&
        results.length === self.limit)
      return false;  // break
    return true;  // continue
  });

  if (!options.ordered)
    return results;

  if (self.sorter) {
    var comparator = self.sorter.getComparator({distances: distances});
    results.sort(comparator);
  }

  var idx_start = self.skip || 0;
  var idx_end = self.limit ? (self.limit + idx_start) : results.length;
  return results.slice(idx_start, idx_end);
};

// XXX Maybe we need a version of observe that just calls a callback if
// anything changed.
LocalCollection.Cursor.prototype._depend = function (changers, _allow_unordered) {
  var self = this;

  if (Tracker.active) {
    var v = new Tracker.Dependency;
    v.depend();
    var notifyChange = _.bind(v.changed, v);

    var options = {
      _suppress_initial: true,
      _allow_unordered: _allow_unordered
    };
    _.each(['added', 'changed', 'removed', 'addedBefore', 'movedBefore'],
           function (fnName) {
             if (changers[fnName])
               options[fnName] = notifyChange;
           });

    // observeChanges will stop() when this computation is invalidated
    self.observeChanges(options);
  }
};

// XXX enforce rule that field names can't start with '$' or contain '.'
// (real mongodb does in fact enforce this)
// XXX possibly enforce that 'undefined' does not appear (we assume
// this in our handling of null and $exists)
LocalCollection.prototype.insert = function (doc, callback) {
  var self = this;
  doc = EJSON.clone(doc);

  if (!_.has(doc, '_id')) {
    // if you really want to use ObjectIDs, set this global.
    // Mongo.Collection specifies its own ids and does not use this code.
    doc._id = LocalCollection._useOID ? new MongoID.ObjectID()
                                      : Random.id();
  }
  var id = doc._id;

  if (self._docs.has(id))
    throw MinimongoError("Duplicate _id '" + id + "'");

  self._saveOriginal(id, undefined);
  self._docs.set(id, doc);

  var queriesToRecompute = [];
  // trigger live queries that match
  for (var qid in self.queries) {
    var query = self.queries[qid];
    var matchResult = query.matcher.documentMatches(doc);
    if (matchResult.result) {
      if (query.distances && matchResult.distance !== undefined)
        query.distances.set(id, matchResult.distance);
      if (query.cursor.skip || query.cursor.limit)
        queriesToRecompute.push(qid);
      else
        LocalCollection._insertInResults(query, doc);
    }
  }

  _.each(queriesToRecompute, function (qid) {
    if (self.queries[qid])
      self._recomputeResults(self.queries[qid]);
  });
  self._observeQueue.drain();

  // Defer because the caller likely doesn't expect the callback to be run
  // immediately.
  if (callback)
    Meteor.defer(function () {
      callback(null, id);
    });
  return id;
};

// Iterates over a subset of documents that could match selector; calls
// f(doc, id) on each of them.  Specifically, if selector specifies
// specific _id's, it only looks at those.  doc is *not* cloned: it is the
// same object that is in _docs.
LocalCollection.prototype._eachPossiblyMatchingDoc = function (selector, f) {
  var self = this;
  var specificIds = LocalCollection._idsMatchedBySelector(selector);
  if (specificIds) {
    for (var i = 0; i < specificIds.length; ++i) {
      var id = specificIds[i];
      var doc = self._docs.get(id);
      if (doc) {
        var breakIfFalse = f(doc, id);
        if (breakIfFalse === false)
          break;
      }
    }
  } else {
    self._docs.forEach(f);
  }
};

LocalCollection.prototype.remove = function (selector, callback) {
  var self = this;

  // Easy special case: if we're not calling observeChanges callbacks and we're
  // not saving originals and we got asked to remove everything, then just empty
  // everything directly.
  if (self.paused && !self._savedOriginals && EJSON.equals(selector, {})) {
    var result = self._docs.size();
    self._docs.clear();
    _.each(self.queries, function (query) {
      if (query.ordered) {
        query.results = [];
      } else {
        query.results.clear();
      }
    });
    if (callback) {
      Meteor.defer(function () {
        callback(null, result);
      });
    }
    return result;
  }

  var matcher = new Minimongo.Matcher(selector);
  var remove = [];
  self._eachPossiblyMatchingDoc(selector, function (doc, id) {
    if (matcher.documentMatches(doc).result)
      remove.push(id);
  });

  var queriesToRecompute = [];
  var queryRemove = [];
  for (var i = 0; i < remove.length; i++) {
    var removeId = remove[i];
    var removeDoc = self._docs.get(removeId);
    _.each(self.queries, function (query, qid) {
      if (query.matcher.documentMatches(removeDoc).result) {
        if (query.cursor.skip || query.cursor.limit)
          queriesToRecompute.push(qid);
        else
          queryRemove.push({qid: qid, doc: removeDoc});
      }
    });
    self._saveOriginal(removeId, removeDoc);
    self._docs.remove(removeId);
  }

  // run live query callbacks _after_ we've removed the documents.
  _.each(queryRemove, function (remove) {
    var query = self.queries[remove.qid];
    if (query) {
      query.distances && query.distances.remove(remove.doc._id);
      LocalCollection._removeFromResults(query, remove.doc);
    }
  });
  _.each(queriesToRecompute, function (qid) {
    var query = self.queries[qid];
    if (query)
      self._recomputeResults(query);
  });
  self._observeQueue.drain();
  result = remove.length;
  if (callback)
    Meteor.defer(function () {
      callback(null, result);
    });
  return result;
};

// XXX atomicity: if multi is true, and one modification fails, do
// we rollback the whole operation, or what?
LocalCollection.prototype.update = function (selector, mod, options, callback) {
  var self = this;
  if (! callback && options instanceof Function) {
    callback = options;
    options = null;
  }
  if (!options) options = {};

  var matcher = new Minimongo.Matcher(selector);

  // Save the original results of any query that we might need to
  // _recomputeResults on, because _modifyAndNotify will mutate the objects in
  // it. (We don't need to save the original results of paused queries because
  // they already have a resultsSnapshot and we won't be diffing in
  // _recomputeResults.)
  var qidToOriginalResults = {};
  // We should only clone each document once, even if it appears in multiple queries
  var docMap = new LocalCollection._IdMap;
  var idsMatchedBySelector = LocalCollection._idsMatchedBySelector(selector);

  _.each(self.queries, function (query, qid) {
    if ((query.cursor.skip || query.cursor.limit) && ! self.paused) {
      // Catch the case of a reactive `count()` on a cursor with skip
      // or limit, which registers an unordered observe. This is a
      // pretty rare case, so we just clone the entire result set with
      // no optimizations for documents that appear in these result
      // sets and other queries.
      if (query.results instanceof LocalCollection._IdMap) {
        qidToOriginalResults[qid] = query.results.clone();
        return;
      }

      if (!(query.results instanceof Array)) {
        throw new Error("Assertion failed: query.results not an array");
      }

      // Clones a document to be stored in `qidToOriginalResults`
      // because it may be modified before the new and old result sets
      // are diffed. But if we know exactly which document IDs we're
      // going to modify, then we only need to clone those.
      var memoizedCloneIfNeeded = function(doc) {
        if (docMap.has(doc._id)) {
          return docMap.get(doc._id);
        } else {
          var docToMemoize;

          if (idsMatchedBySelector && !_.any(idsMatchedBySelector, function(id) {
            return EJSON.equals(id, doc._id);
          })) {
            docToMemoize = doc;
          } else {
            docToMemoize = EJSON.clone(doc);
          }

          docMap.set(doc._id, docToMemoize);
          return docToMemoize;
        }
      };

      qidToOriginalResults[qid] = query.results.map(memoizedCloneIfNeeded);
    }
  });
  var recomputeQids = {};

  var updateCount = 0;

  self._eachPossiblyMatchingDoc(selector, function (doc, id) {
    var queryResult = matcher.documentMatches(doc);
    if (queryResult.result) {
      // XXX Should we save the original even if mod ends up being a no-op?
      self._saveOriginal(id, doc);
      self._modifyAndNotify(doc, mod, recomputeQids, queryResult.arrayIndices);
      ++updateCount;
      if (!options.multi)
        return false;  // break
    }
    return true;
  });

  _.each(recomputeQids, function (dummy, qid) {
    var query = self.queries[qid];
    if (query)
      self._recomputeResults(query, qidToOriginalResults[qid]);
  });
  self._observeQueue.drain();

  // If we are doing an upsert, and we didn't modify any documents yet, then
  // it's time to do an insert. Figure out what document we are inserting, and
  // generate an id for it.
  var insertedId;
  if (updateCount === 0 && options.upsert) {
    var newDoc = LocalCollection._removeDollarOperators(selector);
    LocalCollection._modify(newDoc, mod, {isInsert: true});
    if (! newDoc._id && options.insertedId)
      newDoc._id = options.insertedId;
    insertedId = self.insert(newDoc);
    updateCount = 1;
  }

  // Return the number of affected documents, or in the upsert case, an object
  // containing the number of affected docs and the id of the doc that was
  // inserted, if any.
  var result;
  if (options._returnObject) {
    result = {
      numberAffected: updateCount
    };
    if (insertedId !== undefined)
      result.insertedId = insertedId;
  } else {
    result = updateCount;
  }

  if (callback)
    Meteor.defer(function () {
      callback(null, result);
    });
  return result;
};

// A convenience wrapper on update. LocalCollection.upsert(sel, mod) is
// equivalent to LocalCollection.update(sel, mod, { upsert: true, _returnObject:
// true }).
LocalCollection.prototype.upsert = function (selector, mod, options, callback) {
  var self = this;
  if (! callback && typeof options === "function") {
    callback = options;
    options = {};
  }
  return self.update(selector, mod, _.extend({}, options, {
    upsert: true,
    _returnObject: true
  }), callback);
};

LocalCollection.prototype._modifyAndNotify = function (
    doc, mod, recomputeQids, arrayIndices) {
  var self = this;

  var matched_before = {};
  for (var qid in self.queries) {
    var query = self.queries[qid];
    if (query.ordered) {
      matched_before[qid] = query.matcher.documentMatches(doc).result;
    } else {
      // Because we don't support skip or limit (yet) in unordered queries, we
      // can just do a direct lookup.
      matched_before[qid] = query.results.has(doc._id);
    }
  }

  var old_doc = EJSON.clone(doc);

  LocalCollection._modify(doc, mod, {arrayIndices: arrayIndices});

  for (qid in self.queries) {
    query = self.queries[qid];
    var before = matched_before[qid];
    var afterMatch = query.matcher.documentMatches(doc);
    var after = afterMatch.result;
    if (after && query.distances && afterMatch.distance !== undefined)
      query.distances.set(doc._id, afterMatch.distance);

    if (query.cursor.skip || query.cursor.limit) {
      // We need to recompute any query where the doc may have been in the
      // cursor's window either before or after the update. (Note that if skip
      // or limit is set, "before" and "after" being true do not necessarily
      // mean that the document is in the cursor's output after skip/limit is
      // applied... but if they are false, then the document definitely is NOT
      // in the output. So it's safe to skip recompute if neither before or
      // after are true.)
      if (before || after)
        recomputeQids[qid] = true;
    } else if (before && !after) {
      LocalCollection._removeFromResults(query, doc);
    } else if (!before && after) {
      LocalCollection._insertInResults(query, doc);
    } else if (before && after) {
      LocalCollection._updateInResults(query, doc, old_doc);
    }
  }
};

// XXX the sorted-query logic below is laughably inefficient. we'll
// need to come up with a better datastructure for this.
//
// XXX the logic for observing with a skip or a limit is even more
// laughably inefficient. we recompute the whole results every time!

LocalCollection._insertInResults = function (query, doc) {
  var fields = EJSON.clone(doc);
  delete fields._id;
  if (query.ordered) {
    if (!query.sorter) {
      query.addedBefore(doc._id, query.projectionFn(fields), null);
      query.results.push(doc);
    } else {
      var i = LocalCollection._insertInSortedList(
        query.sorter.getComparator({distances: query.distances}),
        query.results, doc);
      var next = query.results[i+1];
      if (next)
        next = next._id;
      else
        next = null;
      query.addedBefore(doc._id, query.projectionFn(fields), next);
    }
    query.added(doc._id, query.projectionFn(fields));
  } else {
    query.added(doc._id, query.projectionFn(fields));
    query.results.set(doc._id, doc);
  }
};

LocalCollection._removeFromResults = function (query, doc) {
  if (query.ordered) {
    var i = LocalCollection._findInOrderedResults(query, doc);
    query.removed(doc._id);
    query.results.splice(i, 1);
  } else {
    var id = doc._id;  // in case callback mutates doc
    query.removed(doc._id);
    query.results.remove(id);
  }
};

LocalCollection._updateInResults = function (query, doc, old_doc) {
  if (!EJSON.equals(doc._id, old_doc._id))
    throw new Error("Can't change a doc's _id while updating");
  var projectionFn = query.projectionFn;
  var changedFields = DiffSequence.makeChangedFields(
    projectionFn(doc), projectionFn(old_doc));

  if (!query.ordered) {
    if (!_.isEmpty(changedFields)) {
      query.changed(doc._id, changedFields);
      query.results.set(doc._id, doc);
    }
    return;
  }

  var orig_idx = LocalCollection._findInOrderedResults(query, doc);

  if (!_.isEmpty(changedFields))
    query.changed(doc._id, changedFields);
  if (!query.sorter)
    return;

  // just take it out and put it back in again, and see if the index
  // changes
  query.results.splice(orig_idx, 1);
  var new_idx = LocalCollection._insertInSortedList(
    query.sorter.getComparator({distances: query.distances}),
    query.results, doc);
  if (orig_idx !== new_idx) {
    var next = query.results[new_idx+1];
    if (next)
      next = next._id;
    else
      next = null;
    query.movedBefore && query.movedBefore(doc._id, next);
  }
};

// Recomputes the results of a query and runs observe callbacks for the
// difference between the previous results and the current results (unless
// paused). Used for skip/limit queries.
//
// When this is used by insert or remove, it can just use query.results for the
// old results (and there's no need to pass in oldResults), because these
// operations don't mutate the documents in the collection. Update needs to pass
// in an oldResults which was deep-copied before the modifier was applied.
//
// oldResults is guaranteed to be ignored if the query is not paused.
LocalCollection.prototype._recomputeResults = function (query, oldResults) {
  var self = this;
  if (! self.paused && ! oldResults)
    oldResults = query.results;
  if (query.distances)
    query.distances.clear();
  query.results = query.cursor._getRawObjects({
    ordered: query.ordered, distances: query.distances});

  if (! self.paused) {
    LocalCollection._diffQueryChanges(
      query.ordered, oldResults, query.results, query,
      { projectionFn: query.projectionFn });
  }
};


LocalCollection._findInOrderedResults = function (query, doc) {
  if (!query.ordered)
    throw new Error("Can't call _findInOrderedResults on unordered query");
  for (var i = 0; i < query.results.length; i++)
    if (query.results[i] === doc)
      return i;
  throw Error("object missing from query");
};

// This binary search puts a value between any equal values, and the first
// lesser value.
LocalCollection._binarySearch = function (cmp, array, value) {
  var first = 0, rangeLength = array.length;

  while (rangeLength > 0) {
    var halfRange = Math.floor(rangeLength/2);
    if (cmp(value, array[first + halfRange]) >= 0) {
      first += halfRange + 1;
      rangeLength -= halfRange + 1;
    } else {
      rangeLength = halfRange;
    }
  }
  return first;
};

LocalCollection._insertInSortedList = function (cmp, array, value) {
  if (array.length === 0) {
    array.push(value);
    return 0;
  }

  var idx = LocalCollection._binarySearch(cmp, array, value);
  array.splice(idx, 0, value);
  return idx;
};

// To track what documents are affected by a piece of code, call saveOriginals()
// before it and retrieveOriginals() after it. retrieveOriginals returns an
// object whose keys are the ids of the documents that were affected since the
// call to saveOriginals(), and the values are equal to the document's contents
// at the time of saveOriginals. (In the case of an inserted document, undefined
// is the value.) You must alternate between calls to saveOriginals() and
// retrieveOriginals().
LocalCollection.prototype.saveOriginals = function () {
  var self = this;
  if (self._savedOriginals)
    throw new Error("Called saveOriginals twice without retrieveOriginals");
  self._savedOriginals = new LocalCollection._IdMap;
};
LocalCollection.prototype.retrieveOriginals = function () {
  var self = this;
  if (!self._savedOriginals)
    throw new Error("Called retrieveOriginals without saveOriginals");

  var originals = self._savedOriginals;
  self._savedOriginals = null;
  return originals;
};

LocalCollection.prototype._saveOriginal = function (id, doc) {
  var self = this;
  // Are we even trying to save originals?
  if (!self._savedOriginals)
    return;
  // Have we previously mutated the original (and so 'doc' is not actually
  // original)?  (Note the 'has' check rather than truth: we store undefined
  // here for inserted docs!)
  if (self._savedOriginals.has(id))
    return;
  self._savedOriginals.set(id, EJSON.clone(doc));
};

// Pause the observers. No callbacks from observers will fire until
// 'resumeObservers' is called.
LocalCollection.prototype.pauseObservers = function () {
  // No-op if already paused.
  if (this.paused)
    return;

  // Set the 'paused' flag such that new observer messages don't fire.
  this.paused = true;

  // Take a snapshot of the query results for each query.
  for (var qid in this.queries) {
    var query = this.queries[qid];

    query.resultsSnapshot = EJSON.clone(query.results);
  }
};

// Resume the observers. Observers immediately receive change
// notifications to bring them to the current state of the
// database. Note that this is not just replaying all the changes that
// happened during the pause, it is a smarter 'coalesced' diff.
LocalCollection.prototype.resumeObservers = function () {
  var self = this;
  // No-op if not paused.
  if (!this.paused)
    return;

  // Unset the 'paused' flag. Make sure to do this first, otherwise
  // observer methods won't actually fire when we trigger them.
  this.paused = false;

  for (var qid in this.queries) {
    var query = self.queries[qid];
    // Diff the current results against the snapshot and send to observers.
    // pass the query object for its observer callbacks.
    LocalCollection._diffQueryChanges(
      query.ordered, query.resultsSnapshot, query.results, query,
      { projectionFn: query.projectionFn });
    query.resultsSnapshot = null;
  }
  self._observeQueue.drain();
};

