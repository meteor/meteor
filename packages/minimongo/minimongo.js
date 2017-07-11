// Make sure field names do not contain Mongo restricted
// characters ('.', '$', '\0').
// https://docs.mongodb.com/manual/reference/limits/#Restrictions-on-Field-Names
const invalidCharMsg = {
  '.': "contain '.'",
  '$': "start with '$'",
  '\0': "contain null bytes",
};
function assertIsValidFieldName(key) {
  let match;
  if (typeof key === 'string' && (match = key.match(/^\$|\.|\0/))) {
    throw MinimongoError(`Key ${key} must not ${invalidCharMsg[match[0]]}`);
  }
};

// checks if all field names in an object are valid
function assertHasValidFieldNames(doc){
  if (doc && typeof doc === "object") {
    JSON.stringify(doc, (key, value) => {
      assertIsValidFieldName(key);
      return value;
    });
  }
};


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

MinimongoError = function (message, options={}) {
  if (typeof message === "string" && options.field) {
    message += ` for field '${options.field}'`;
  }

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

  objects.forEach(function (elt, i) {
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

Object.assign(LocalCollection.Cursor.prototype, {
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
      dirty: false,
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
      var results = query.results._map || query.results;
      Object.keys(results).forEach(function (key) {
        var doc = results[key];
        var fields = EJSON.clone(doc);

        delete fields._id;
        if (ordered)
          query.addedBefore(doc._id, self._projectionFn(fields), null);
        query.added(doc._id, self._projectionFn(fields));
      });
    }

    var handle = new LocalCollection.ObserveHandle;
    Object.assign(handle, {
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
    var notifyChange = v.changed.bind(v);

    var options = {
      _suppress_initial: true,
      _allow_unordered: _allow_unordered
    };
    ['added', 'changed', 'removed', 'addedBefore', 'movedBefore'].forEach(function (fnName) {
      if (changers[fnName])
        options[fnName] = notifyChange;
    });

    // observeChanges will stop() when this computation is invalidated
    self.observeChanges(options);
  }
};

// XXX possibly enforce that 'undefined' does not appear (we assume
// this in our handling of null and $exists)
LocalCollection.prototype.insert = function (doc, callback) {
  var self = this;
  doc = EJSON.clone(doc);

  assertHasValidFieldNames(doc);

  if (!doc.hasOwnProperty('_id')) {
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
    if (query.dirty) continue;
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

  queriesToRecompute.forEach(function (qid) {
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
    Object.keys(self.queries).forEach(function (qid) {
      var query = self.queries[qid];
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
    Object.keys(self.queries).forEach(function (qid) {
      var query = self.queries[qid];
      if (query.dirty) return;

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
  queryRemove.forEach(function (remove) {
    var query = self.queries[remove.qid];
    if (query) {
      query.distances && query.distances.remove(remove.doc._id);
      LocalCollection._removeFromResults(query, remove.doc);
    }
  });
  queriesToRecompute.forEach(function (qid) {
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

  var matcher = new Minimongo.Matcher(selector, true);

  // Save the original results of any query that we might need to
  // _recomputeResults on, because _modifyAndNotify will mutate the objects in
  // it. (We don't need to save the original results of paused queries because
  // they already have a resultsSnapshot and we won't be diffing in
  // _recomputeResults.)
  var qidToOriginalResults = {};
  // We should only clone each document once, even if it appears in multiple queries
  var docMap = new LocalCollection._IdMap;
  var idsMatchedBySelector = LocalCollection._idsMatchedBySelector(selector);

  Object.keys(self.queries).forEach(function (qid) {
    var query = self.queries[qid];
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

          if (idsMatchedBySelector && !idsMatchedBySelector.some(function(id) {
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

  Object.keys(recomputeQids).forEach(function (qid) {
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

    let selectorModifier = LocalCollection._selectorIsId(selector)
      ? { _id: selector }
      : selector;

    selectorModifier = LocalCollection._removeDollarOperators(selectorModifier);

    const newDoc = {};
    if (selectorModifier._id) {
      newDoc._id = selectorModifier._id;
      delete selectorModifier._id;
    }

    // This double _modify call is made to help work around an issue where collection
    // upserts won't work properly, with nested properties (see issue #8631).
    LocalCollection._modify(newDoc, {$set: selectorModifier});
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
  return self.update(selector, mod, Object.assign({}, options, {
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
    if (query.dirty) continue;

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
    if (query.dirty) continue;

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
    if (Object.keys(changedFields).length) {
      query.changed(doc._id, changedFields);
      query.results.set(doc._id, doc);
    }
    return;
  }

  var orig_idx = LocalCollection._findInOrderedResults(query, doc);

  if (Object.keys(changedFields).length)
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
  if (self.paused) {
    // There's no reason to recompute the results now as we're still paused.
    // By flagging the query as "dirty", the recompute will be performed
    // when resumeObservers is called.
    query.dirty = true;
    return;
  }

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
    if (query.dirty) {
      query.dirty = false;
      // re-compute results will perform `LocalCollection._diffQueryChanges` automatically.
      self._recomputeResults(query, query.resultsSnapshot);
    } else {
      // Diff the current results against the snapshot and send to observers.
      // pass the query object for its observer callbacks.
      LocalCollection._diffQueryChanges(
        query.ordered, query.resultsSnapshot, query.results, query,
        {projectionFn: query.projectionFn});
    }
    query.resultsSnapshot = null;
  }
  self._observeQueue.drain();
};

// Wrap a transform function to return objects that have the _id field
// of the untransformed document. This ensures that subsystems such as
// the observe-sequence package that call `observe` can keep track of
// the documents identities.
//
// - Require that it returns objects
// - If the return value has an _id field, verify that it matches the
//   original _id field
// - If the return value doesn't have an _id field, add it back.
LocalCollection.wrapTransform = function (transform) {
  if (! transform)
    return null;

  // No need to doubly-wrap transforms.
  if (transform.__wrappedTransform__)
    return transform;

  var wrapped = function (doc) {
    if (!doc.hasOwnProperty('_id')) {
      // XXX do we ever have a transform on the oplog's collection? because that
      // collection has no _id.
      throw new Error("can only transform documents with _id");
    }

    var id = doc._id;
    // XXX consider making tracker a weak dependency and checking Package.tracker here
    var transformed = Tracker.nonreactive(function () {
      return transform(doc);
    });

    if (!isPlainObject(transformed)) {
      throw new Error("transform must return object");
    }

    if (transformed.hasOwnProperty('_id')) {
      if (!EJSON.equals(transformed._id, id)) {
        throw new Error("transformed document can't have different _id");
      }
    } else {
      transformed._id = id;
    }
    return transformed;
  };
  wrapped.__wrappedTransform__ = true;
  return wrapped;
};

// Like _.isArray, but doesn't regard polyfilled Uint8Arrays on old browsers as
// arrays.
// XXX maybe this should be EJSON.isArray
isArray = function (x) {
  return Array.isArray(x) && !EJSON.isBinary(x);
};

// XXX maybe this should be EJSON.isObject, though EJSON doesn't know about
// RegExp
// XXX note that _type(undefined) === 3!!!!
isPlainObject = LocalCollection._isPlainObject = function (x) {
  return x && LocalCollection._f._type(x) === 3;
};

isIndexable = function (x) {
  return isArray(x) || isPlainObject(x);
};

// Returns true if this is an object with at least one key and all keys begin
// with $.  Unless inconsistentOK is set, throws if some keys begin with $ and
// others don't.
isOperatorObject = function (valueSelector, inconsistentOK) {
  if (!isPlainObject(valueSelector))
    return false;

  var theseAreOperators = undefined;
  Object.keys(valueSelector).forEach(function (selKey) {
    var thisIsOperator = selKey.substr(0, 1) === '$';
    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      if (!inconsistentOK)
        throw new Error("Inconsistent operator: " +
                        JSON.stringify(valueSelector));
      theseAreOperators = false;
    }
  });
  return !!theseAreOperators;  // {} has no operators
};


// string can be converted to integer
isNumericKey = function (s) {
  return /^[0-9]+$/.test(s);
};

// The minimongo selector compiler!

// Terminology:
//  - a "selector" is the EJSON object representing a selector
//  - a "matcher" is its compiled form (whether a full Minimongo.Matcher
//    object or one of the component lambdas that matches parts of it)
//  - a "result object" is an object with a "result" field and maybe
//    distance and arrayIndices.
//  - a "branched value" is an object with a "value" field and maybe
//    "dontIterate" and "arrayIndices".
//  - a "document" is a top-level object that can be stored in a collection.
//  - a "lookup function" is a function that takes in a document and returns
//    an array of "branched values".
//  - a "branched matcher" maps from an array of branched values to a result
//    object.
//  - an "element matcher" maps from a single value to a bool.

// Main entry point.
//   var matcher = new Minimongo.Matcher({a: {$gt: 5}});
//   if (matcher.documentMatches({a: 7})) ...
Minimongo.Matcher = function (selector, isUpdate = false) {
  var self = this;
  // A set (object mapping string -> *) of all of the document paths looked
  // at by the selector. Also includes the empty string if it may look at any
  // path (eg, $where).
  self._paths = {};
  // Set to true if compilation finds a $near.
  self._hasGeoQuery = false;
  // Set to true if compilation finds a $where.
  self._hasWhere = false;
  // Set to false if compilation finds anything other than a simple equality or
  // one or more of '$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin' used with
  // scalars as operands.
  self._isSimple = true;
  // Set to a dummy document which always matches this Matcher. Or set to null
  // if such document is too hard to find.
  self._matchingDocument = undefined;
  // A clone of the original selector. It may just be a function if the user
  // passed in a function; otherwise is definitely an object (eg, IDs are
  // translated into {_id: ID} first. Used by canBecomeTrueByModifier and
  // Sorter._useWithMatcher.
  self._selector = null;
  self._docMatcher = self._compileSelector(selector);
  // Set to true if selection is done for an update operation
  // Default is false
  // Used for $near array update (issue #3599)
  self._isUpdate = isUpdate;
};

Object.assign(Minimongo.Matcher.prototype, {
  documentMatches: function (doc) {
    if (!doc || typeof doc !== "object") {
      throw Error("documentMatches needs a document");
    }
    return this._docMatcher(doc);
  },
  hasGeoQuery: function () {
    return this._hasGeoQuery;
  },
  hasWhere: function () {
    return this._hasWhere;
  },
  isSimple: function () {
    return this._isSimple;
  },

  // Given a selector, return a function that takes one argument, a
  // document. It returns a result object.
  _compileSelector: function (selector) {
    var self = this;
    // you can pass a literal function instead of a selector
    if (selector instanceof Function) {
      self._isSimple = false;
      self._selector = selector;
      self._recordPathUsed('');
      return function (doc) {
        return {result: !!selector.call(doc)};
      };
    }

    // shorthand -- scalars match _id
    if (LocalCollection._selectorIsId(selector)) {
      self._selector = {_id: selector};
      self._recordPathUsed('_id');
      return function (doc) {
        return {result: EJSON.equals(doc._id, selector)};
      };
    }

    // protect against dangerous selectors.  falsey and {_id: falsey} are both
    // likely programmer error, and not what you want, particularly for
    // destructive operations.
    if (!selector || (('_id' in selector) && !selector._id)) {
      self._isSimple = false;
      return nothingMatcher;
    }

    // Top level can't be an array or true or binary.
    if (typeof(selector) === 'boolean' || isArray(selector) ||
        EJSON.isBinary(selector))
      throw new Error("Invalid selector: " + selector);

    self._selector = EJSON.clone(selector);
    return compileDocumentSelector(selector, self, {isRoot: true});
  },
  _recordPathUsed: function (path) {
    this._paths[path] = true;
  },
  // Returns a list of key paths the given selector is looking for. It includes
  // the empty string if there is a $where.
  _getPaths: function () {
    return Object.keys(this._paths);
  }
});


// Takes in a selector that could match a full document (eg, the original
// selector). Returns a function mapping document->result object.
//
// matcher is the Matcher object we are compiling.
//
// If this is the root document selector (ie, not wrapped in $and or the like),
// then isRoot is true. (This is used by $near.)
var compileDocumentSelector = function (docSelector, matcher, options) {
  options = options || {};
  var docMatchers = [];
  Object.keys(docSelector).forEach(function (key) {
    var subSelector = docSelector[key];
    if (key.substr(0, 1) === '$') {
      // Outer operators are either logical operators (they recurse back into
      // this function), or $where.
      if (!LOGICAL_OPERATORS.hasOwnProperty(key))
        throw new Error("Unrecognized logical operator: " + key);
      matcher._isSimple = false;
      docMatchers.push(LOGICAL_OPERATORS[key](subSelector, matcher,
                                              options.inElemMatch));
    } else {
      // Record this path, but only if we aren't in an elemMatcher, since in an
      // elemMatch this is a path inside an object in an array, not in the doc
      // root.
      if (!options.inElemMatch)
        matcher._recordPathUsed(key);
      var lookUpByIndex = makeLookupFunction(key);
      var valueMatcher =
        compileValueSelector(subSelector, matcher, options.isRoot);
      docMatchers.push(function (doc) {
        var branchValues = lookUpByIndex(doc);
        return valueMatcher(branchValues);
      });
    }
  });

  return andDocumentMatchers(docMatchers);
};

// Takes in a selector that could match a key-indexed value in a document; eg,
// {$gt: 5, $lt: 9}, or a regular expression, or any non-expression object (to
// indicate equality).  Returns a branched matcher: a function mapping
// [branched value]->result object.
var compileValueSelector = function (valueSelector, matcher, isRoot) {
  if (valueSelector instanceof RegExp) {
    matcher._isSimple = false;
    return convertElementMatcherToBranchedMatcher(
      regexpElementMatcher(valueSelector));
  } else if (isOperatorObject(valueSelector)) {
    return operatorBranchedMatcher(valueSelector, matcher, isRoot);
  } else {
    return convertElementMatcherToBranchedMatcher(
      equalityElementMatcher(valueSelector));
  }
};

// Given an element matcher (which evaluates a single value), returns a branched
// value (which evaluates the element matcher on all the branches and returns a
// more structured return value possibly including arrayIndices).
var convertElementMatcherToBranchedMatcher = function (
    elementMatcher, options) {
  options = options || {};
  return function (branches) {
    var expanded = branches;
    if (!options.dontExpandLeafArrays) {
      expanded = expandArraysInBranches(
        branches, options.dontIncludeLeafArrays);
    }
    var ret = {};
    ret.result = expanded.some(function (element) {
      var matched = elementMatcher(element.value);

      // Special case for $elemMatch: it means "true, and use this as an array
      // index if I didn't already have one".
      if (typeof matched === 'number') {
        // XXX This code dates from when we only stored a single array index
        // (for the outermost array). Should we be also including deeper array
        // indices from the $elemMatch match?
        if (!element.arrayIndices)
          element.arrayIndices = [matched];
        matched = true;
      }

      // If some element matched, and it's tagged with array indices, include
      // those indices in our result object.
      if (matched && element.arrayIndices)
        ret.arrayIndices = element.arrayIndices;

      return matched;
    });
    return ret;
  };
};

// Takes a RegExp object and returns an element matcher.
regexpElementMatcher = function (regexp) {
  return function (value) {
    if (value instanceof RegExp) {
      return value.toString() === regexp.toString();
    }
    // Regexps only work against strings.
    if (typeof value !== 'string')
      return false;

    // Reset regexp's state to avoid inconsistent matching for objects with the
    // same value on consecutive calls of regexp.test. This happens only if the
    // regexp has the 'g' flag. Also note that ES6 introduces a new flag 'y' for
    // which we should *not* change the lastIndex but MongoDB doesn't support
    // either of these flags.
    regexp.lastIndex = 0;

    return regexp.test(value);
  };
};

// Takes something that is not an operator object and returns an element matcher
// for equality with that thing.
equalityElementMatcher = function (elementSelector) {
  if (isOperatorObject(elementSelector))
    throw Error("Can't create equalityValueSelector for operator object");

  // Special-case: null and undefined are equal (if you got undefined in there
  // somewhere, or if you got it due to some branch being non-existent in the
  // weird special case), even though they aren't with EJSON.equals.
  if (elementSelector == null) {  // undefined or null
    return function (value) {
      return value == null;  // undefined or null
    };
  }

  return function (value) {
    return LocalCollection._f._equal(elementSelector, value);
  };
};

// Takes an operator object (an object with $ keys) and returns a branched
// matcher for it.
var operatorBranchedMatcher = function (valueSelector, matcher, isRoot) {
  // Each valueSelector works separately on the various branches.  So one
  // operator can match one branch and another can match another branch.  This
  // is OK.

  var operatorMatchers = [];
  Object.keys(valueSelector).forEach(function (operator) {
    var operand = valueSelector[operator];
    var simpleRange = ['$lt', '$lte', '$gt', '$gte'].includes(operator) &&
      typeof operand === 'number';
    var simpleEquality = ['$ne', '$eq'].includes(operator) && operand !== Object(operand);
    var simpleInclusion = ['$in', '$nin'].includes(operator) &&
      Array.isArray(operand) && !operand.some(function (x) { return x === Object(x); });

    if (! (simpleRange || simpleInclusion || simpleEquality)) {
      matcher._isSimple = false;
    }

    if (VALUE_OPERATORS.hasOwnProperty(operator)) {
      operatorMatchers.push(
        VALUE_OPERATORS[operator](operand, valueSelector, matcher, isRoot));
    } else if (ELEMENT_OPERATORS.hasOwnProperty(operator)) {
      var options = ELEMENT_OPERATORS[operator];
      operatorMatchers.push(
        convertElementMatcherToBranchedMatcher(
          options.compileElementSelector(
            operand, valueSelector, matcher),
          options));
    } else {
      throw new Error("Unrecognized operator: " + operator);
    }
  });

  return andBranchedMatchers(operatorMatchers);
};

var compileArrayOfDocumentSelectors = function (
    selectors, matcher, inElemMatch) {
  if (!isArray(selectors) || selectors.length === 0)
    throw Error("$and/$or/$nor must be nonempty array");
  return selectors.map(function (subSelector) {
    if (!isPlainObject(subSelector))
      throw Error("$or/$and/$nor entries need to be full objects");
    return compileDocumentSelector(
      subSelector, matcher, {inElemMatch: inElemMatch});
  });
};

// Operators that appear at the top level of a document selector.
var LOGICAL_OPERATORS = {
  $and: function (subSelector, matcher, inElemMatch) {
    var matchers = compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);
    return andDocumentMatchers(matchers);
  },

  $or: function (subSelector, matcher, inElemMatch) {
    var matchers = compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);

    // Special case: if there is only one matcher, use it directly, *preserving*
    // any arrayIndices it returns.
    if (matchers.length === 1)
      return matchers[0];

    return function (doc) {
      var result = matchers.some(function (f) {
        return f(doc).result;
      });
      // $or does NOT set arrayIndices when it has multiple
      // sub-expressions. (Tested against MongoDB.)
      return {result: result};
    };
  },

  $nor: function (subSelector, matcher, inElemMatch) {
    var matchers = compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);
    return function (doc) {
      var result = matchers.every(function (f) {
        return !f(doc).result;
      });
      // Never set arrayIndices, because we only match if nothing in particular
      // "matched" (and because this is consistent with MongoDB).
      return {result: result};
    };
  },

  $where: function (selectorValue, matcher) {
    // Record that *any* path may be used.
    matcher._recordPathUsed('');
    matcher._hasWhere = true;
    if (!(selectorValue instanceof Function)) {
      // XXX MongoDB seems to have more complex logic to decide where or or not
      // to add "return"; not sure exactly what it is.
      selectorValue = Function("obj", "return " + selectorValue);
    }
    return function (doc) {
      // We make the document available as both `this` and `obj`.
      // XXX not sure what we should do if this throws
      return {result: selectorValue.call(doc, doc)};
    };
  },

  // This is just used as a comment in the query (in MongoDB, it also ends up in
  // query logs); it has no effect on the actual selection.
  $comment: function () {
    return function () {
      return {result: true};
    };
  }
};

// Returns a branched matcher that matches iff the given matcher does not.
// Note that this implicitly "deMorganizes" the wrapped function.  ie, it
// means that ALL branch values need to fail to match innerBranchedMatcher.
var invertBranchedMatcher = function (branchedMatcher) {
  return function (branchValues) {
    var invertMe = branchedMatcher(branchValues);
    // We explicitly choose to strip arrayIndices here: it doesn't make sense to
    // say "update the array element that does not match something", at least
    // in mongo-land.
    return {result: !invertMe.result};
  };
};

// Operators that (unlike LOGICAL_OPERATORS) pertain to individual paths in a
// document, but (unlike ELEMENT_OPERATORS) do not have a simple definition as
// "match each branched value independently and combine with
// convertElementMatcherToBranchedMatcher".
var VALUE_OPERATORS = {
  $eq: function (operand) {
    return convertElementMatcherToBranchedMatcher(
      equalityElementMatcher(operand));
  },
  $not: function (operand, valueSelector, matcher) {
    return invertBranchedMatcher(compileValueSelector(operand, matcher));
  },
  $ne: function (operand) {
    return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(
      equalityElementMatcher(operand)));
  },
  $nin: function (operand) {
    return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(
      ELEMENT_OPERATORS.$in.compileElementSelector(operand)));
  },
  $exists: function (operand) {
    var exists = convertElementMatcherToBranchedMatcher(function (value) {
      return value !== undefined;
    });
    return operand ? exists : invertBranchedMatcher(exists);
  },
  // $options just provides options for $regex; its logic is inside $regex
  $options: function (operand, valueSelector) {
    if (!valueSelector.hasOwnProperty('$regex'))
      throw Error("$options needs a $regex");
    return everythingMatcher;
  },
  // $maxDistance is basically an argument to $near
  $maxDistance: function (operand, valueSelector) {
    if (!valueSelector.$near)
      throw Error("$maxDistance needs a $near");
    return everythingMatcher;
  },
  $all: function (operand, valueSelector, matcher) {
    if (!isArray(operand))
      throw Error("$all requires array");
    // Not sure why, but this seems to be what MongoDB does.
    if (operand.length === 0)
      return nothingMatcher;

    var branchedMatchers = [];
    operand.forEach(function (criterion) {
      // XXX handle $all/$elemMatch combination
      if (isOperatorObject(criterion))
        throw Error("no $ expressions in $all");
      // This is always a regexp or equality selector.
      branchedMatchers.push(compileValueSelector(criterion, matcher));
    });
    // andBranchedMatchers does NOT require all selectors to return true on the
    // SAME branch.
    return andBranchedMatchers(branchedMatchers);
  },
  $near: function (operand, valueSelector, matcher, isRoot) {
    if (!isRoot)
      throw Error("$near can't be inside another $ operator");
    matcher._hasGeoQuery = true;

    // There are two kinds of geodata in MongoDB: legacy coordinate pairs and
    // GeoJSON. They use different distance metrics, too. GeoJSON queries are
    // marked with a $geometry property, though legacy coordinates can be
    // matched using $geometry.

    var maxDistance, point, distance;
    if (isPlainObject(operand) && operand.hasOwnProperty('$geometry')) {
      // GeoJSON "2dsphere" mode.
      maxDistance = operand.$maxDistance;
      point = operand.$geometry;
      distance = function (value) {
        // XXX: for now, we don't calculate the actual distance between, say,
        // polygon and circle. If people care about this use-case it will get
        // a priority.
        if (!value)
          return null;
        if(!value.type)
          return GeoJSON.pointDistance(point,
            { type: "Point", coordinates: pointToArray(value) });
        if (value.type === "Point") {
          return GeoJSON.pointDistance(point, value);
        } else {
          return GeoJSON.geometryWithinRadius(value, point, maxDistance)
            ? 0 : maxDistance + 1;
        }
      };
    } else {
      maxDistance = valueSelector.$maxDistance;
      if (!isArray(operand) && !isPlainObject(operand))
        throw Error("$near argument must be coordinate pair or GeoJSON");
      point = pointToArray(operand);
      distance = function (value) {
        if (!isArray(value) && !isPlainObject(value))
          return null;
        return distanceCoordinatePairs(point, value);
      };
    }

    return function (branchedValues) {
      // There might be multiple points in the document that match the given
      // field. Only one of them needs to be within $maxDistance, but we need to
      // evaluate all of them and use the nearest one for the implicit sort
      // specifier. (That's why we can't just use ELEMENT_OPERATORS here.)
      //
      // Note: This differs from MongoDB's implementation, where a document will
      // actually show up *multiple times* in the result set, with one entry for
      // each within-$maxDistance branching point.
      branchedValues = expandArraysInBranches(branchedValues);
      var result = {result: false};
      branchedValues.every(function (branch) {
        // if operation is an update, don't skip branches, just return the first one (#3599)
        if (!matcher._isUpdate){
          if (!(typeof branch.value === "object")){
            return true;
          }
          var curDistance = distance(branch.value);
          // Skip branches that aren't real points or are too far away.
          if (curDistance === null || curDistance > maxDistance)
            return true;
          // Skip anything that's a tie.
          if (result.distance !== undefined && result.distance <= curDistance)
            return true;
        }
        result.result = true;
        result.distance = curDistance;
        if (!branch.arrayIndices)
          delete result.arrayIndices;
        else
          result.arrayIndices = branch.arrayIndices;
        if (matcher._isUpdate)
          return false;
        return true;
      });
      return result;
    };
  }
};

// Helpers for $near.
var distanceCoordinatePairs = function (a, b) {
  a = pointToArray(a);
  b = pointToArray(b);
  var x = a[0] - b[0];
  var y = a[1] - b[1];
  if (Number.isNaN(x) || Number.isNaN(y))
    return null;
  return Math.sqrt(x * x + y * y);
};
// Makes sure we get 2 elements array and assume the first one to be x and
// the second one to y no matter what user passes.
// In case user passes { lon: x, lat: y } returns [x, y]
var pointToArray = function (point) {
  return Array.isArray(point) ? point.slice() : [point.x, point.y];
};

// Helper for $lt/$gt/$lte/$gte.
var makeInequality = function (cmpValueComparator) {
  return {
    compileElementSelector: function (operand) {
      // Arrays never compare false with non-arrays for any inequality.
      // XXX This was behavior we observed in pre-release MongoDB 2.5, but
      //     it seems to have been reverted.
      //     See https://jira.mongodb.org/browse/SERVER-11444
      if (isArray(operand)) {
        return function () {
          return false;
        };
      }

      // Special case: consider undefined and null the same (so true with
      // $gte/$lte).
      if (operand === undefined)
        operand = null;

      var operandType = LocalCollection._f._type(operand);

      return function (value) {
        if (value === undefined)
          value = null;
        // Comparisons are never true among things of different type (except
        // null vs undefined).
        if (LocalCollection._f._type(value) !== operandType)
          return false;
        return cmpValueComparator(LocalCollection._f._cmp(value, operand));
      };
    }
  };
};

// Helpers for $bitsAllSet/$bitsAnySet/$bitsAllClear/$bitsAnyClear.
var getOperandBitmask = function(operand, selector) {
  // numeric bitmask
  // You can provide a numeric bitmask to be matched against the operand field. It must be representable as a non-negative 32-bit signed integer.
  // Otherwise, $bitsAllSet will return an error.
  if (Number.isInteger(operand) && operand >= 0) {
    return new Uint8Array(new Int32Array([operand]).buffer)
  }
  // bindata bitmask
  // You can also use an arbitrarily large BinData instance as a bitmask.
  else if (EJSON.isBinary(operand)) {
    return new Uint8Array(operand.buffer)
  }
  // position list
  // If querying a list of bit positions, each <position> must be a non-negative integer. Bit positions start at 0 from the least significant bit.
  else if (isArray(operand) && operand.every(function (e) {
    return Number.isInteger(e) && e >= 0
  })) {
    var buffer = new ArrayBuffer((Math.max(...operand) >> 3) + 1)
    var view = new Uint8Array(buffer)
    operand.forEach(function (x) {
      view[x >> 3] |= (1 << (x & 0x7))
    })
    return view
  }
  // bad operand
  else {
    throw Error(`operand to ${selector} must be a numeric bitmask (representable as a non-negative 32-bit signed integer), a bindata bitmask or an array with bit positions (non-negative integers)`)
  }
}
var getValueBitmask = function (value, length) {
  // The field value must be either numerical or a BinData instance. Otherwise, $bits... will not match the current document.
  // numerical
  if (Number.isSafeInteger(value)) {
    // $bits... will not match numerical values that cannot be represented as a signed 64-bit integer
    // This can be the case if a value is either too large or small to fit in a signed 64-bit integer, or if it has a fractional component.
    var buffer = new ArrayBuffer(Math.max(length, 2 * Uint32Array.BYTES_PER_ELEMENT));
    var view = new Uint32Array(buffer, 0, 2)
    view[0] = (value % ((1 << 16) * (1 << 16))) | 0
    view[1] = (value / ((1 << 16) * (1 << 16))) | 0
    // sign extension
    if (value < 0) {
      view = new Uint8Array(buffer, 2)
      view.forEach(function (byte, idx) {
        view[idx] = 0xff
      })
    }
    return new Uint8Array(buffer)
  }
  // bindata
  else if (EJSON.isBinary(value)) {
    return new Uint8Array(value.buffer)
  }
  // no match
  return false
}

// Each element selector contains:
//  - compileElementSelector, a function with args:
//    - operand - the "right hand side" of the operator
//    - valueSelector - the "context" for the operator (so that $regex can find
//      $options)
//    - matcher - the Matcher this is going into (so that $elemMatch can compile
//      more things)
//    returning a function mapping a single value to bool.
//  - dontExpandLeafArrays, a bool which prevents expandArraysInBranches from
//    being called
//  - dontIncludeLeafArrays, a bool which causes an argument to be passed to
//    expandArraysInBranches if it is called
ELEMENT_OPERATORS = {
  $lt: makeInequality(function (cmpValue) {
    return cmpValue < 0;
  }),
  $gt: makeInequality(function (cmpValue) {
    return cmpValue > 0;
  }),
  $lte: makeInequality(function (cmpValue) {
    return cmpValue <= 0;
  }),
  $gte: makeInequality(function (cmpValue) {
    return cmpValue >= 0;
  }),
  $mod: {
    compileElementSelector: function (operand) {
      if (!(isArray(operand) && operand.length === 2
            && typeof(operand[0]) === 'number'
            && typeof(operand[1]) === 'number')) {
        throw Error("argument to $mod must be an array of two numbers");
      }
      // XXX could require to be ints or round or something
      var divisor = operand[0];
      var remainder = operand[1];
      return function (value) {
        return typeof value === 'number' && value % divisor === remainder;
      };
    }
  },
  $in: {
    compileElementSelector: function (operand) {
      if (!isArray(operand))
        throw Error("$in needs an array");

      var elementMatchers = [];
      operand.forEach(function (option) {
        if (option instanceof RegExp)
          elementMatchers.push(regexpElementMatcher(option));
        else if (isOperatorObject(option))
          throw Error("cannot nest $ under $in");
        else
          elementMatchers.push(equalityElementMatcher(option));
      });

      return function (value) {
        // Allow {a: {$in: [null]}} to match when 'a' does not exist.
        if (value === undefined)
          value = null;
        return elementMatchers.some(function (e) {
          return e(value);
        });
      };
    }
  },
  $size: {
    // {a: [[5, 5]]} must match {a: {$size: 1}} but not {a: {$size: 2}}, so we
    // don't want to consider the element [5,5] in the leaf array [[5,5]] as a
    // possible value.
    dontExpandLeafArrays: true,
    compileElementSelector: function (operand) {
      if (typeof operand === 'string') {
        // Don't ask me why, but by experimentation, this seems to be what Mongo
        // does.
        operand = 0;
      } else if (typeof operand !== 'number') {
        throw Error("$size needs a number");
      }
      return function (value) {
        return isArray(value) && value.length === operand;
      };
    }
  },
  $type: {
    // {a: [5]} must not match {a: {$type: 4}} (4 means array), but it should
    // match {a: {$type: 1}} (1 means number), and {a: [[5]]} must match {$a:
    // {$type: 4}}. Thus, when we see a leaf array, we *should* expand it but
    // should *not* include it itself.
    dontIncludeLeafArrays: true,
    compileElementSelector: function (operand) {
      if (typeof operand !== 'number')
        throw Error("$type needs a number");
      return function (value) {
        return value !== undefined
          && LocalCollection._f._type(value) === operand;
      };
    }
  },
  $bitsAllSet: {
    compileElementSelector: function (operand) {
      var op = getOperandBitmask(operand, '$bitsAllSet')
      return function (value) {
        var bitmask = getValueBitmask(value, op.length)
        return bitmask && op.every(function (byte, idx) {
          return ((bitmask[idx] & byte) == byte)
        })
      }
    }
  },
  $bitsAnySet: {
    compileElementSelector: function (operand) {
      var query = getOperandBitmask(operand, '$bitsAnySet')
      return function (value) {
        var bitmask = getValueBitmask(value, query.length)
        return bitmask && query.some(function (byte, idx) {
          return ((~bitmask[idx] & byte) !== byte)
        })
      }
    }
  },
  $bitsAllClear: {
    compileElementSelector: function (operand) {
      var query = getOperandBitmask(operand, '$bitsAllClear')
      return function (value) {
        var bitmask = getValueBitmask(value, query.length)
        return bitmask && query.every(function (byte, idx) {
          return !(bitmask[idx] & byte)
        })
      }
    }
  },
  $bitsAnyClear: {
    compileElementSelector: function (operand) {
      var query = getOperandBitmask(operand, '$bitsAnyClear')
      return function (value) {
        var bitmask = getValueBitmask(value, query.length)
        return bitmask && query.some(function (byte, idx) {
          return ((bitmask[idx] & byte) !== byte)
        })
      }
    }
  },
  $regex: {
    compileElementSelector: function (operand, valueSelector) {
      if (!(typeof operand === 'string' || operand instanceof RegExp))
        throw Error("$regex has to be a string or RegExp");

      var regexp;
      if (valueSelector.$options !== undefined) {
        // Options passed in $options (even the empty string) always overrides
        // options in the RegExp object itself. (See also
        // Mongo.Collection._rewriteSelector.)

        // Be clear that we only support the JS-supported options, not extended
        // ones (eg, Mongo supports x and s). Ideally we would implement x and s
        // by transforming the regexp, but not today...
        if (/[^gim]/.test(valueSelector.$options))
          throw new Error("Only the i, m, and g regexp options are supported");

        var regexSource = operand instanceof RegExp ? operand.source : operand;
        regexp = new RegExp(regexSource, valueSelector.$options);
      } else if (operand instanceof RegExp) {
        regexp = operand;
      } else {
        regexp = new RegExp(operand);
      }
      return regexpElementMatcher(regexp);
    }
  },
  $elemMatch: {
    dontExpandLeafArrays: true,
    compileElementSelector: function (operand, valueSelector, matcher) {
      if (!isPlainObject(operand))
        throw Error("$elemMatch need an object");

      var subMatcher, isDocMatcher;
      if (isOperatorObject(Object.keys(operand)
          .filter(function (key) { return !Object.keys(LOGICAL_OPERATORS).includes(key); })
          .reduce(function (a, b) { return Object.assign(a, {[b]: operand[b]}); }, {}), true)) {
        subMatcher = compileValueSelector(operand, matcher);
        isDocMatcher = false;
      } else {
        // This is NOT the same as compileValueSelector(operand), and not just
        // because of the slightly different calling convention.
        // {$elemMatch: {x: 3}} means "an element has a field x:3", not
        // "consists only of a field x:3". Also, regexps and sub-$ are allowed.
        subMatcher = compileDocumentSelector(operand, matcher,
                                             {inElemMatch: true});
        isDocMatcher = true;
      }

      return function (value) {
        if (!isArray(value))
          return false;
        for (var i = 0; i < value.length; ++i) {
          var arrayElement = value[i];
          var arg;
          if (isDocMatcher) {
            // We can only match {$elemMatch: {b: 3}} against objects.
            // (We can also match against arrays, if there's numeric indices,
            // eg {$elemMatch: {'0.b': 3}} or {$elemMatch: {0: 3}}.)
            if (!isPlainObject(arrayElement) && !isArray(arrayElement))
              return false;
            arg = arrayElement;
          } else {
            // dontIterate ensures that {a: {$elemMatch: {$gt: 5}}} matches
            // {a: [8]} but not {a: [[8]]}
            arg = [{value: arrayElement, dontIterate: true}];
          }
          // XXX support $near in $elemMatch by propagating $distance?
          if (subMatcher(arg).result)
            return i;   // specially understood to mean "use as arrayIndices"
        }
        return false;
      };
    }
  }
};

// makeLookupFunction(key) returns a lookup function.
//
// A lookup function takes in a document and returns an array of matching
// branches.  If no arrays are found while looking up the key, this array will
// have exactly one branches (possibly 'undefined', if some segment of the key
// was not found).
//
// If arrays are found in the middle, this can have more than one element, since
// we "branch". When we "branch", if there are more key segments to look up,
// then we only pursue branches that are plain objects (not arrays or scalars).
// This means we can actually end up with no branches!
//
// We do *NOT* branch on arrays that are found at the end (ie, at the last
// dotted member of the key). We just return that array; if you want to
// effectively "branch" over the array's values, post-process the lookup
// function with expandArraysInBranches.
//
// Each branch is an object with keys:
//  - value: the value at the branch
//  - dontIterate: an optional bool; if true, it means that 'value' is an array
//    that expandArraysInBranches should NOT expand. This specifically happens
//    when there is a numeric index in the key, and ensures the
//    perhaps-surprising MongoDB behavior where {'a.0': 5} does NOT
//    match {a: [[5]]}.
//  - arrayIndices: if any array indexing was done during lookup (either due to
//    explicit numeric indices or implicit branching), this will be an array of
//    the array indices used, from outermost to innermost; it is falsey or
//    absent if no array index is used. If an explicit numeric index is used,
//    the index will be followed in arrayIndices by the string 'x'.
//
//    Note: arrayIndices is used for two purposes. First, it is used to
//    implement the '$' modifier feature, which only ever looks at its first
//    element.
//
//    Second, it is used for sort key generation, which needs to be able to tell
//    the difference between different paths. Moreover, it needs to
//    differentiate between explicit and implicit branching, which is why
//    there's the somewhat hacky 'x' entry: this means that explicit and
//    implicit array lookups will have different full arrayIndices paths. (That
//    code only requires that different paths have different arrayIndices; it
//    doesn't actually "parse" arrayIndices. As an alternative, arrayIndices
//    could contain objects with flags like "implicit", but I think that only
//    makes the code surrounding them more complex.)
//
//    (By the way, this field ends up getting passed around a lot without
//    cloning, so never mutate any arrayIndices field/var in this package!)
//
//
// At the top level, you may only pass in a plain object or array.
//
// See the test 'minimongo - lookup' for some examples of what lookup functions
// return.
makeLookupFunction = function (key, options) {
  options = options || {};
  var parts = key.split('.');
  var firstPart = parts.length ? parts[0] : '';
  var firstPartIsNumeric = isNumericKey(firstPart);
  var nextPartIsNumeric = parts.length >= 2 && isNumericKey(parts[1]);
  var lookupRest;
  if (parts.length > 1) {
    lookupRest = makeLookupFunction(parts.slice(1).join('.'));
  }

  var omitUnnecessaryFields = function (retVal) {
    if (!retVal.dontIterate)
      delete retVal.dontIterate;
    if (retVal.arrayIndices && !retVal.arrayIndices.length)
      delete retVal.arrayIndices;
    return retVal;
  };

  // Doc will always be a plain object or an array.
  // apply an explicit numeric index, an array.
  return function (doc, arrayIndices) {
    if (!arrayIndices)
      arrayIndices = [];

    if (isArray(doc)) {
      // If we're being asked to do an invalid lookup into an array (non-integer
      // or out-of-bounds), return no results (which is different from returning
      // a single undefined result, in that `null` equality checks won't match).
      if (!(firstPartIsNumeric && firstPart < doc.length))
        return [];

      // Remember that we used this array index. Include an 'x' to indicate that
      // the previous index came from being considered as an explicit array
      // index (not branching).
      arrayIndices = arrayIndices.concat(+firstPart, 'x');
    }

    // Do our first lookup.
    var firstLevel = doc[firstPart];

    // If there is no deeper to dig, return what we found.
    //
    // If what we found is an array, most value selectors will choose to treat
    // the elements of the array as matchable values in their own right, but
    // that's done outside of the lookup function. (Exceptions to this are $size
    // and stuff relating to $elemMatch.  eg, {a: {$size: 2}} does not match {a:
    // [[1, 2]]}.)
    //
    // That said, if we just did an *explicit* array lookup (on doc) to find
    // firstLevel, and firstLevel is an array too, we do NOT want value
    // selectors to iterate over it.  eg, {'a.0': 5} does not match {a: [[5]]}.
    // So in that case, we mark the return value as "don't iterate".
    if (!lookupRest) {
      return [omitUnnecessaryFields({
        value: firstLevel,
        dontIterate: isArray(doc) && isArray(firstLevel),
        arrayIndices: arrayIndices})];
    }

    // We need to dig deeper.  But if we can't, because what we've found is not
    // an array or plain object, we're done. If we just did a numeric index into
    // an array, we return nothing here (this is a change in Mongo 2.5 from
    // Mongo 2.4, where {'a.0.b': null} stopped matching {a: [5]}). Otherwise,
    // return a single `undefined` (which can, for example, match via equality
    // with `null`).
    if (!isIndexable(firstLevel)) {
      if (isArray(doc))
        return [];
      return [omitUnnecessaryFields({value: undefined,
                                      arrayIndices: arrayIndices})];
    }

    var result = [];
    var appendToResult = function (more) {
      Array.prototype.push.apply(result, more);
    };

    // Dig deeper: look up the rest of the parts on whatever we've found.
    // (lookupRest is smart enough to not try to do invalid lookups into
    // firstLevel if it's an array.)
    appendToResult(lookupRest(firstLevel, arrayIndices));

    // If we found an array, then in *addition* to potentially treating the next
    // part as a literal integer lookup, we should also "branch": try to look up
    // the rest of the parts on each array element in parallel.
    //
    // In this case, we *only* dig deeper into array elements that are plain
    // objects. (Recall that we only got this far if we have further to dig.)
    // This makes sense: we certainly don't dig deeper into non-indexable
    // objects. And it would be weird to dig into an array: it's simpler to have
    // a rule that explicit integer indexes only apply to an outer array, not to
    // an array you find after a branching search.
    //
    // In the special case of a numeric part in a *sort selector* (not a query
    // selector), we skip the branching: we ONLY allow the numeric part to mean
    // "look up this index" in that case, not "also look up this index in all
    // the elements of the array".
    if (isArray(firstLevel) && !(nextPartIsNumeric && options.forSort)) {
      firstLevel.forEach(function (branch, arrayIndex) {
        if (isPlainObject(branch)) {
          appendToResult(lookupRest(
            branch,
            arrayIndices.concat(arrayIndex)));
        }
      });
    }

    return result;
  };
};
MinimongoTest.makeLookupFunction = makeLookupFunction;

expandArraysInBranches = function (branches, skipTheArrays) {
  var branchesOut = [];
  branches.forEach(function (branch) {
    var thisIsArray = isArray(branch.value);
    // We include the branch itself, *UNLESS* we it's an array that we're going
    // to iterate and we're told to skip arrays.  (That's right, we include some
    // arrays even skipTheArrays is true: these are arrays that were found via
    // explicit numerical indices.)
    if (!(skipTheArrays && thisIsArray && !branch.dontIterate)) {
      branchesOut.push({
        value: branch.value,
        arrayIndices: branch.arrayIndices
      });
    }
    if (thisIsArray && !branch.dontIterate) {
      branch.value.forEach(function (leaf, i) {
        branchesOut.push({
          value: leaf,
          arrayIndices: (branch.arrayIndices || []).concat(i)
        });
      });
    }
  });
  return branchesOut;
};

var nothingMatcher = function (docOrBranchedValues) {
  return {result: false};
};

var everythingMatcher = function (docOrBranchedValues) {
  return {result: true};
};


// NB: We are cheating and using this function to implement "AND" for both
// "document matchers" and "branched matchers". They both return result objects
// but the argument is different: for the former it's a whole doc, whereas for
// the latter it's an array of "branched values".
var andSomeMatchers = function (subMatchers) {
  if (subMatchers.length === 0)
    return everythingMatcher;
  if (subMatchers.length === 1)
    return subMatchers[0];

  return function (docOrBranches) {
    var ret = {};
    ret.result = subMatchers.every(function (f) {
      var subResult = f(docOrBranches);
      // Copy a 'distance' number out of the first sub-matcher that has
      // one. Yes, this means that if there are multiple $near fields in a
      // query, something arbitrary happens; this appears to be consistent with
      // Mongo.
      if (subResult.result && subResult.distance !== undefined
          && ret.distance === undefined) {
        ret.distance = subResult.distance;
      }
      // Similarly, propagate arrayIndices from sub-matchers... but to match
      // MongoDB behavior, this time the *last* sub-matcher with arrayIndices
      // wins.
      if (subResult.result && subResult.arrayIndices) {
        ret.arrayIndices = subResult.arrayIndices;
      }
      return subResult.result;
    });

    // If we didn't actually match, forget any extra metadata we came up with.
    if (!ret.result) {
      delete ret.distance;
      delete ret.arrayIndices;
    }
    return ret;
  };
};

var andDocumentMatchers = andSomeMatchers;
var andBranchedMatchers = andSomeMatchers;


// helpers used by compiled selector code
LocalCollection._f = {
  // XXX for _all and _in, consider building 'inquery' at compile time..

  _type: function (v) {
    if (typeof v === "number")
      return 1;
    if (typeof v === "string")
      return 2;
    if (typeof v === "boolean")
      return 8;
    if (isArray(v))
      return 4;
    if (v === null)
      return 10;
    if (v instanceof RegExp)
      // note that typeof(/x/) === "object"
      return 11;
    if (typeof v === "function")
      return 13;
    if (v instanceof Date)
      return 9;
    if (EJSON.isBinary(v))
      return 5;
    if (v instanceof MongoID.ObjectID)
      return 7;
    return 3; // object

    // XXX support some/all of these:
    // 14, symbol
    // 15, javascript code with scope
    // 16, 18: 32-bit/64-bit integer
    // 17, timestamp
    // 255, minkey
    // 127, maxkey
  },

  // deep equality test: use for literal document and array matches
  _equal: function (a, b) {
    return EJSON.equals(a, b, {keyOrderSensitive: true});
  },

  // maps a type code to a value that can be used to sort values of
  // different types
  _typeorder: function (t) {
    // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types
    // XXX what is the correct sort position for Javascript code?
    // ('100' in the matrix below)
    // XXX minkey/maxkey
    return [-1,  // (not a type)
            1,   // number
            2,   // string
            3,   // object
            4,   // array
            5,   // binary
            -1,  // deprecated
            6,   // ObjectID
            7,   // bool
            8,   // Date
            0,   // null
            9,   // RegExp
            -1,  // deprecated
            100, // JS code
            2,   // deprecated (symbol)
            100, // JS code
            1,   // 32-bit int
            8,   // Mongo timestamp
            1    // 64-bit int
           ][t];
  },

  // compare two values of unknown type according to BSON ordering
  // semantics. (as an extension, consider 'undefined' to be less than
  // any other value.) return negative if a is less, positive if b is
  // less, or 0 if equal
  _cmp: function (a, b) {
    if (a === undefined)
      return b === undefined ? 0 : -1;
    if (b === undefined)
      return 1;
    var ta = LocalCollection._f._type(a);
    var tb = LocalCollection._f._type(b);
    var oa = LocalCollection._f._typeorder(ta);
    var ob = LocalCollection._f._typeorder(tb);
    if (oa !== ob)
      return oa < ob ? -1 : 1;
    if (ta !== tb)
      // XXX need to implement this if we implement Symbol or integers, or
      // Timestamp
      throw Error("Missing type coercion logic in _cmp");
    if (ta === 7) { // ObjectID
      // Convert to string.
      ta = tb = 2;
      a = a.toHexString();
      b = b.toHexString();
    }
    if (ta === 9) { // Date
      // Convert to millis.
      ta = tb = 1;
      a = a.getTime();
      b = b.getTime();
    }

    if (ta === 1) // double
      return a - b;
    if (tb === 2) // string
      return a < b ? -1 : (a === b ? 0 : 1);
    if (ta === 3) { // Object
      // this could be much more efficient in the expected case ...
      var to_array = function (obj) {
        var ret = [];
        for (var key in obj) {
          ret.push(key);
          ret.push(obj[key]);
        }
        return ret;
      };
      return LocalCollection._f._cmp(to_array(a), to_array(b));
    }
    if (ta === 4) { // Array
      for (var i = 0; ; i++) {
        if (i === a.length)
          return (i === b.length) ? 0 : -1;
        if (i === b.length)
          return 1;
        var s = LocalCollection._f._cmp(a[i], b[i]);
        if (s !== 0)
          return s;
      }
    }
    if (ta === 5) { // binary
      // Surprisingly, a small binary blob is always less than a large one in
      // Mongo.
      if (a.length !== b.length)
        return a.length - b.length;
      for (i = 0; i < a.length; i++) {
        if (a[i] < b[i])
          return -1;
        if (a[i] > b[i])
          return 1;
      }
      return 0;
    }
    if (ta === 8) { // boolean
      if (a) return b ? 0 : 1;
      return b ? -1 : 0;
    }
    if (ta === 10) // null
      return 0;
    if (ta === 11) // regexp
      throw Error("Sorting not supported on regular expression"); // XXX
    // 13: javascript code
    // 14: symbol
    // 15: javascript code with scope
    // 16: 32-bit integer
    // 17: timestamp
    // 18: 64-bit integer
    // 255: minkey
    // 127: maxkey
    if (ta === 13) // javascript code
      throw Error("Sorting not supported on Javascript code"); // XXX
    throw Error("Unknown type to sort");
  }
};

const objectOnlyHasDollarKeys = (object) => {
  const keys = Object.keys(object);
  return keys.length > 0 && keys.every(key => key.charAt(0) === '$');
};

// When performing an upsert, the incoming selector object can be re-used as
// the upsert modifier object, as long as Mongo query and projection
// operators (prefixed with a $ character) are removed from the newly
// created modifier object. This function attempts to strip all $ based Mongo
// operators when creating the upsert modifier object.
// NOTE: There is a known issue here in that some Mongo $ based opeartors
// should not actually be stripped.
// See https://github.com/meteor/meteor/issues/8806.
LocalCollection._removeDollarOperators = (selector) => {
  let cleansed = {};
  Object.keys(selector).forEach((key) => {
    const value = selector[key];
    if (key.charAt(0) !== '$' && !objectOnlyHasDollarKeys(value)) {
      if (value !== null
          && value.constructor
          && Object.getPrototypeOf(value) === Object.prototype) {
        cleansed[key] = LocalCollection._removeDollarOperators(value);
      } else {
        cleansed[key] = value;
      }
    }
  });
  return cleansed;
};

// Give a sort spec, which can be in any of these forms:
//   {"key1": 1, "key2": -1}
//   [["key1", "asc"], ["key2", "desc"]]
//   ["key1", ["key2", "desc"]]
//
// (.. with the first form being dependent on the key enumeration
// behavior of your javascript VM, which usually does what you mean in
// this case if the key names don't look like integers ..)
//
// return a function that takes two objects, and returns -1 if the
// first object comes first in order, 1 if the second object comes
// first, or 0 if neither object comes before the other.

Minimongo.Sorter = function (spec, options) {
  var self = this;
  options = options || {};

  self._sortSpecParts = [];
  self._sortFunction = null;

  var addSpecPart = function (path, ascending) {
    if (!path)
      throw Error("sort keys must be non-empty");
    if (path.charAt(0) === '$')
      throw Error("unsupported sort key: " + path);
    self._sortSpecParts.push({
      path: path,
      lookup: makeLookupFunction(path, {forSort: true}),
      ascending: ascending
    });
  };

  if (spec instanceof Array) {
    for (var i = 0; i < spec.length; i++) {
      if (typeof spec[i] === "string") {
        addSpecPart(spec[i], true);
      } else {
        addSpecPart(spec[i][0], spec[i][1] !== "desc");
      }
    }
  } else if (typeof spec === "object") {
    Object.keys(spec).forEach(function (key) {
      var value = spec[key];
      addSpecPart(key, value >= 0);
    });
  } else if (typeof spec === "function") {
    self._sortFunction = spec;
  } else {
    throw Error("Bad sort specification: " + JSON.stringify(spec));
  }

  // If a function is specified for sorting, we skip the rest.
  if (self._sortFunction)
    return;

  // To implement affectedByModifier, we piggy-back on top of Matcher's
  // affectedByModifier code; we create a selector that is affected by the same
  // modifiers as this sort order. This is only implemented on the server.
  if (self.affectedByModifier) {
    var selector = {};
    self._sortSpecParts.forEach(function (spec) {
      selector[spec.path] = 1;
    });
    self._selectorForAffectedByModifier = new Minimongo.Matcher(selector);
  }

  self._keyComparator = composeComparators(
    self._sortSpecParts.map(function (spec, i) {
      return self._keyFieldComparator(i);
    }));

  // If you specify a matcher for this Sorter, _keyFilter may be set to a
  // function which selects whether or not a given "sort key" (tuple of values
  // for the different sort spec fields) is compatible with the selector.
  self._keyFilter = null;
  options.matcher && self._useWithMatcher(options.matcher);
};

// In addition to these methods, sorter_project.js defines combineIntoProjection
// on the server only.
Object.assign(Minimongo.Sorter.prototype, {
  getComparator: function (options) {
    var self = this;

    // If sort is specified or have no distances, just use the comparator from
    // the source specification (which defaults to "everything is equal".
    // issue #3599
    // https://docs.mongodb.com/manual/reference/operator/query/near/#sort-operation
    // sort effectively overrides $near
    if (self._sortSpecParts.length || !options || !options.distances) {
      return self._getBaseComparator();
    }

    var distances = options.distances;

    // Return a comparator which compares using $near distances.
    return function (a, b) {
      if (!distances.has(a._id))
        throw Error("Missing distance for " + a._id);
      if (!distances.has(b._id))
        throw Error("Missing distance for " + b._id);
      return distances.get(a._id) - distances.get(b._id);
    };
  },

  _getPaths: function () {
    var self = this;
    return self._sortSpecParts.map(function (part) { return part.path; });
  },

  // Finds the minimum key from the doc, according to the sort specs.  (We say
  // "minimum" here but this is with respect to the sort spec, so "descending"
  // sort fields mean we're finding the max for that field.)
  //
  // Note that this is NOT "find the minimum value of the first field, the
  // minimum value of the second field, etc"... it's "choose the
  // lexicographically minimum value of the key vector, allowing only keys which
  // you can find along the same paths".  ie, for a doc {a: [{x: 0, y: 5}, {x:
  // 1, y: 3}]} with sort spec {'a.x': 1, 'a.y': 1}, the only keys are [0,5] and
  // [1,3], and the minimum key is [0,5]; notably, [0,3] is NOT a key.
  _getMinKeyFromDoc: function (doc) {
    var self = this;
    var minKey = null;

    self._generateKeysFromDoc(doc, function (key) {
      if (!self._keyCompatibleWithSelector(key))
        return;

      if (minKey === null) {
        minKey = key;
        return;
      }
      if (self._compareKeys(key, minKey) < 0) {
        minKey = key;
      }
    });

    // This could happen if our key filter somehow filters out all the keys even
    // though somehow the selector matches.
    if (minKey === null)
      throw Error("sort selector found no keys in doc?");
    return minKey;
  },

  _keyCompatibleWithSelector: function (key) {
    var self = this;
    return !self._keyFilter || self._keyFilter(key);
  },

  // Iterates over each possible "key" from doc (ie, over each branch), calling
  // 'cb' with the key.
  _generateKeysFromDoc: function (doc, cb) {
    var self = this;

    if (self._sortSpecParts.length === 0)
      throw new Error("can't generate keys without a spec");

    // maps index -> ({'' -> value} or {path -> value})
    var valuesByIndexAndPath = [];

    var pathFromIndices = function (indices) {
      return indices.join(',') + ',';
    };

    var knownPaths = null;

    self._sortSpecParts.forEach(function (spec, whichField) {
      // Expand any leaf arrays that we find, and ignore those arrays
      // themselves.  (We never sort based on an array itself.)
      var branches = expandArraysInBranches(spec.lookup(doc), true);

      // If there are no values for a key (eg, key goes to an empty array),
      // pretend we found one null value.
      if (!branches.length)
        branches = [{value: null}];

      var usedPaths = false;
      valuesByIndexAndPath[whichField] = {};
      branches.forEach(function (branch) {
        if (!branch.arrayIndices) {
          // If there are no array indices for a branch, then it must be the
          // only branch, because the only thing that produces multiple branches
          // is the use of arrays.
          if (branches.length > 1)
            throw Error("multiple branches but no array used?");
          valuesByIndexAndPath[whichField][''] = branch.value;
          return;
        }

        usedPaths = true;
        var path = pathFromIndices(branch.arrayIndices);
        if (valuesByIndexAndPath[whichField].hasOwnProperty(path))
          throw Error("duplicate path: " + path);
        valuesByIndexAndPath[whichField][path] = branch.value;

        // If two sort fields both go into arrays, they have to go into the
        // exact same arrays and we have to find the same paths.  This is
        // roughly the same condition that makes MongoDB throw this strange
        // error message.  eg, the main thing is that if sort spec is {a: 1,
        // b:1} then a and b cannot both be arrays.
        //
        // (In MongoDB it seems to be OK to have {a: 1, 'a.x.y': 1} where 'a'
        // and 'a.x.y' are both arrays, but we don't allow this for now.
        // #NestedArraySort
        // XXX achieve full compatibility here
        if (knownPaths && !knownPaths.hasOwnProperty(path)) {
          throw Error("cannot index parallel arrays");
        }
      });

      if (knownPaths) {
        // Similarly to above, paths must match everywhere, unless this is a
        // non-array field.
        if (!valuesByIndexAndPath[whichField].hasOwnProperty('') &&
            Object.keys(knownPaths).length !== Object.keys(valuesByIndexAndPath[whichField]).length) {
          throw Error("cannot index parallel arrays!");
        }
      } else if (usedPaths) {
        knownPaths = {};
        Object.keys(valuesByIndexAndPath[whichField]).forEach(function (path) {
          knownPaths[path] = true;
        });
      }
    });

    if (!knownPaths) {
      // Easy case: no use of arrays.
      var soleKey = valuesByIndexAndPath.map(function (values) {
        if (!values.hasOwnProperty(''))
          throw Error("no value in sole key case?");
        return values[''];
      });
      cb(soleKey);
      return;
    }

    Object.keys(knownPaths).forEach(function (path) {
      var key = valuesByIndexAndPath.map(function (values) {
        if (values.hasOwnProperty(''))
          return values[''];
        if (!values.hasOwnProperty(path))
          throw Error("missing path?");
        return values[path];
      });
      cb(key);
    });
  },

  // Takes in two keys: arrays whose lengths match the number of spec
  // parts. Returns negative, 0, or positive based on using the sort spec to
  // compare fields.
  _compareKeys: function (key1, key2) {
    var self = this;
    if (key1.length !== self._sortSpecParts.length ||
        key2.length !== self._sortSpecParts.length) {
      throw Error("Key has wrong length");
    }

    return self._keyComparator(key1, key2);
  },

  // Given an index 'i', returns a comparator that compares two key arrays based
  // on field 'i'.
  _keyFieldComparator: function (i) {
    var self = this;
    var invert = !self._sortSpecParts[i].ascending;
    return function (key1, key2) {
      var compare = LocalCollection._f._cmp(key1[i], key2[i]);
      if (invert)
        compare = -compare;
      return compare;
    };
  },

  // Returns a comparator that represents the sort specification (but not
  // including a possible geoquery distance tie-breaker).
  _getBaseComparator: function () {
    var self = this;

    if (self._sortFunction)
      return self._sortFunction;

    // If we're only sorting on geoquery distance and no specs, just say
    // everything is equal.
    if (!self._sortSpecParts.length) {
      return function (doc1, doc2) {
        return 0;
      };
    }

    return function (doc1, doc2) {
      var key1 = self._getMinKeyFromDoc(doc1);
      var key2 = self._getMinKeyFromDoc(doc2);
      return self._compareKeys(key1, key2);
    };
  },

  // In MongoDB, if you have documents
  //    {_id: 'x', a: [1, 10]} and
  //    {_id: 'y', a: [5, 15]},
  // then C.find({}, {sort: {a: 1}}) puts x before y (1 comes before 5).
  // But  C.find({a: {$gt: 3}}, {sort: {a: 1}}) puts y before x (1 does not
  // match the selector, and 5 comes before 10).
  //
  // The way this works is pretty subtle!  For example, if the documents
  // are instead {_id: 'x', a: [{x: 1}, {x: 10}]}) and
  //             {_id: 'y', a: [{x: 5}, {x: 15}]}),
  // then C.find({'a.x': {$gt: 3}}, {sort: {'a.x': 1}}) and
  //      C.find({a: {$elemMatch: {x: {$gt: 3}}}}, {sort: {'a.x': 1}})
  // both follow this rule (y before x).  (ie, you do have to apply this
  // through $elemMatch.)
  //
  // So if you pass a matcher to this sorter's constructor, we will attempt to
  // skip sort keys that don't match the selector. The logic here is pretty
  // subtle and undocumented; we've gotten as close as we can figure out based
  // on our understanding of Mongo's behavior.
  _useWithMatcher: function (matcher) {
    var self = this;

    if (self._keyFilter)
      throw Error("called _useWithMatcher twice?");

    // If we are only sorting by distance, then we're not going to bother to
    // build a key filter.
    // XXX figure out how geoqueries interact with this stuff
    if (!self._sortSpecParts.length)
      return;

    var selector = matcher._selector;

    // If the user just passed a literal function to find(), then we can't get a
    // key filter from it.
    if (selector instanceof Function)
      return;

    var constraintsByPath = {};
    self._sortSpecParts.forEach(function (spec, i) {
      constraintsByPath[spec.path] = [];
    });

    Object.keys(selector).forEach(function (key) {
      var subSelector = selector[key];
      // XXX support $and and $or

      var constraints = constraintsByPath[key];
      if (!constraints)
        return;

      // XXX it looks like the real MongoDB implementation isn't "does the
      // regexp match" but "does the value fall into a range named by the
      // literal prefix of the regexp", ie "foo" in /^foo(bar|baz)+/  But
      // "does the regexp match" is a good approximation.
      if (subSelector instanceof RegExp) {
        // As far as we can tell, using either of the options that both we and
        // MongoDB support ('i' and 'm') disables use of the key filter. This
        // makes sense: MongoDB mostly appears to be calculating ranges of an
        // index to use, which means it only cares about regexps that match
        // one range (with a literal prefix), and both 'i' and 'm' prevent the
        // literal prefix of the regexp from actually meaning one range.
        if (subSelector.ignoreCase || subSelector.multiline)
          return;
        constraints.push(regexpElementMatcher(subSelector));
        return;
      }

      if (isOperatorObject(subSelector)) {
        Object.keys(subSelector).forEach(function (operator) {
          var operand = subSelector[operator];
          if (['$lt', '$lte', '$gt', '$gte'].includes(operator)) {
            // XXX this depends on us knowing that these operators don't use any
            // of the arguments to compileElementSelector other than operand.
            constraints.push(
              ELEMENT_OPERATORS[operator].compileElementSelector(operand));
          }

          // See comments in the RegExp block above.
          if (operator === '$regex' && !subSelector.$options) {
            constraints.push(
              ELEMENT_OPERATORS.$regex.compileElementSelector(
                operand, subSelector));
          }

          // XXX support {$exists: true}, $mod, $type, $in, $elemMatch
        });
        return;
      }

      // OK, it's an equality thing.
      constraints.push(equalityElementMatcher(subSelector));
    });

    // It appears that the first sort field is treated differently from the
    // others; we shouldn't create a key filter unless the first sort field is
    // restricted, though after that point we can restrict the other sort fields
    // or not as we wish.
    if (!constraintsByPath[self._sortSpecParts[0].path].length)
      return;

    self._keyFilter = function (key) {
      return self._sortSpecParts.every(function (specPart, index) {
        return constraintsByPath[specPart.path].every(function (f) {
          return f(key[index]);
        });
      });
    };
  }
});

// Given an array of comparators
// (functions (a,b)->(negative or positive or zero)), returns a single
// comparator which uses each comparator in order and returns the first
// non-zero value.
var composeComparators = function (comparatorArray) {
  return function (a, b) {
    for (var i = 0; i < comparatorArray.length; ++i) {
      var compare = comparatorArray[i](a, b);
      if (compare !== 0)
        return compare;
    }
    return 0;
  };
};
// Knows how to compile a fields projection to a predicate function.
// @returns - Function: a closure that filters out an object according to the
//            fields projection rules:
//            @param obj - Object: MongoDB-styled document
//            @returns - Object: a document with the fields filtered out
//                       according to projection rules. Doesn't retain subfields
//                       of passed argument.
LocalCollection._compileProjection = function (fields) {
  LocalCollection._checkSupportedProjection(fields);

  var _idProjection = fields._id === undefined ? true : fields._id;
  var details = projectionDetails(fields);

  // returns transformed doc according to ruleTree
  var transform = function (doc, ruleTree) {
    // Special case for "sets"
    if (Array.isArray(doc))
      return doc.map(function (subdoc) { return transform(subdoc, ruleTree); });

    var res = details.including ? {} : EJSON.clone(doc);
    Object.keys(ruleTree).forEach(function (key) {
      var rule = ruleTree[key];
      if (!doc.hasOwnProperty(key))
        return;
      if (rule === Object(rule)) {
        // For sub-objects/subsets we branch
        if (doc[key] === Object(doc[key]))
          res[key] = transform(doc[key], rule);
        // Otherwise we don't even touch this subfield
      } else if (details.including)
        res[key] = EJSON.clone(doc[key]);
      else
        delete res[key];
    });

    return res;
  };

  return function (obj) {
    var res = transform(obj, details.tree);

    if (_idProjection && obj.hasOwnProperty('_id'))
      res._id = obj._id;
    if (!_idProjection && res.hasOwnProperty('_id'))
      delete res._id;
    return res;
  };
};

// Traverses the keys of passed projection and constructs a tree where all
// leaves are either all True or all False
// @returns Object:
//  - tree - Object - tree representation of keys involved in projection
//  (exception for '_id' as it is a special case handled separately)
//  - including - Boolean - "take only certain fields" type of projection
projectionDetails = function (fields) {
  // Find the non-_id keys (_id is handled specially because it is included unless
  // explicitly excluded). Sort the keys, so that our code to detect overlaps
  // like 'foo' and 'foo.bar' can assume that 'foo' comes first.
  var fieldsKeys = Object.keys(fields).sort();

  // If _id is the only field in the projection, do not remove it, since it is
  // required to determine if this is an exclusion or exclusion. Also keep an
  // inclusive _id, since inclusive _id follows the normal rules about mixing
  // inclusive and exclusive fields. If _id is not the only field in the
  // projection and is exclusive, remove it so it can be handled later by a
  // special case, since exclusive _id is always allowed.
  if (fieldsKeys.length > 0 &&
      !(fieldsKeys.length === 1 && fieldsKeys[0] === '_id') &&
      !(fieldsKeys.includes('_id') && fields['_id']))
    fieldsKeys = fieldsKeys.filter(function (key) { return key !== '_id'; });

  var including = null; // Unknown

  fieldsKeys.forEach(function (keyPath) {
    var rule = !!fields[keyPath];
    if (including === null)
      including = rule;
    if (including !== rule)
      // This error message is copied from MongoDB shell
      throw MinimongoError("You cannot currently mix including and excluding fields.");
  });


  var projectionRulesTree = pathsToTree(
    fieldsKeys,
    function (path) { return including; },
    function (node, path, fullPath) {
      // Check passed projection fields' keys: If you have two rules such as
      // 'foo.bar' and 'foo.bar.baz', then the result becomes ambiguous. If
      // that happens, there is a probability you are doing something wrong,
      // framework should notify you about such mistake earlier on cursor
      // compilation step than later during runtime.  Note, that real mongo
      // doesn't do anything about it and the later rule appears in projection
      // project, more priority it takes.
      //
      // Example, assume following in mongo shell:
      // > db.coll.insert({ a: { b: 23, c: 44 } })
      // > db.coll.find({}, { 'a': 1, 'a.b': 1 })
      // { "_id" : ObjectId("520bfe456024608e8ef24af3"), "a" : { "b" : 23 } }
      // > db.coll.find({}, { 'a.b': 1, 'a': 1 })
      // { "_id" : ObjectId("520bfe456024608e8ef24af3"), "a" : { "b" : 23, "c" : 44 } }
      //
      // Note, how second time the return set of keys is different.

      var currentPath = fullPath;
      var anotherPath = path;
      throw MinimongoError("both " + currentPath + " and " + anotherPath +
                           " found in fields option, using both of them may trigger " +
                           "unexpected behavior. Did you mean to use only one of them?");
    });

  return {
    tree: projectionRulesTree,
    including: including
  };
};

// paths - Array: list of mongo style paths
// newLeafFn - Function: of form function(path) should return a scalar value to
//                       put into list created for that path
// conflictFn - Function: of form function(node, path, fullPath) is called
//                        when building a tree path for 'fullPath' node on
//                        'path' was already a leaf with a value. Must return a
//                        conflict resolution.
// initial tree - Optional Object: starting tree.
// @returns - Object: tree represented as a set of nested objects
pathsToTree = function (paths, newLeafFn, conflictFn, tree) {
  tree = tree || {};
  paths.forEach(function (keyPath) {
    var treePos = tree;
    var pathArr = keyPath.split('.');

    // use .every just for iteration with break
    var success = pathArr.slice(0, -1).every(function (key, idx) {
      if (!treePos.hasOwnProperty(key))
        treePos[key] = {};
      else if (treePos[key] !== Object(treePos[key])) {
        treePos[key] = conflictFn(treePos[key],
                                  pathArr.slice(0, idx + 1).join('.'),
                                  keyPath);
        // break out of loop if we are failing for this path
        if (treePos[key] !== Object(treePos[key]))
          return false;
      }

      treePos = treePos[key];
      return true;
    });

    if (success) {
      var lastKey = pathArr[pathArr.length - 1];
      if (!treePos.hasOwnProperty(lastKey))
        treePos[lastKey] = newLeafFn(keyPath);
      else
        treePos[lastKey] = conflictFn(treePos[lastKey], keyPath, keyPath);
    }
  });

  return tree;
};

LocalCollection._checkSupportedProjection = function (fields) {
  if (fields !== Object(fields) || Array.isArray(fields))
    throw MinimongoError("fields option must be an object");

  Object.keys(fields).forEach(function (keyPath) {
    var val = fields[keyPath];
    if (keyPath.split('.').includes('$'))
      throw MinimongoError("Minimongo doesn't support $ operator in projections yet.");
    if (typeof val === 'object' && ['$elemMatch', '$meta', '$slice'].some(key => Object.keys(val).includes(key)))
      throw MinimongoError("Minimongo doesn't support operators in projections yet.");
    if (![1, 0, true, false].includes(val))
      throw MinimongoError("Projection values should be one of 1, 0, true, or false");
  });
};

// XXX need a strategy for passing the binding of $ into this
// function, from the compiled selector
//
// maybe just {key.up.to.just.before.dollarsign: array_index}
//
// XXX atomicity: if one modification fails, do we roll back the whole
// change?
//
// options:
//   - isInsert is set when _modify is being called to compute the document to
//     insert as part of an upsert operation. We use this primarily to figure
//     out when to set the fields in $setOnInsert, if present.
LocalCollection._modify = function (doc, mod, options) {
  options = options || {};
  if (!isPlainObject(mod))
    throw MinimongoError("Modifier must be an object");

  // Make sure the caller can't mutate our data structures.
  mod = EJSON.clone(mod);

  var isModifier = isOperatorObject(mod);

  var newDoc;

  if (!isModifier) {
    if (mod._id && !EJSON.equals(doc._id, mod._id))
      throw MinimongoError("Cannot change the _id of a document");

    // replace the whole document
    assertHasValidFieldNames(mod);
    newDoc = mod;
  } else {
    // apply modifiers to the doc.
    newDoc = EJSON.clone(doc);

    Object.keys(mod).forEach(function (op) {
      var operand = mod[op];
      var modFunc = MODIFIERS[op];
      // Treat $setOnInsert as $set if this is an insert.
      if (options.isInsert && op === '$setOnInsert')
        modFunc = MODIFIERS['$set'];
      if (!modFunc)
        throw MinimongoError("Invalid modifier specified " + op);
      Object.keys(operand).forEach(function (keypath) {
        var arg = operand[keypath];
        if (keypath === '') {
          throw MinimongoError("An empty update path is not valid.");
        }

        if (keypath === '_id' && op !== '$setOnInsert') {
          throw MinimongoError("Mod on _id not allowed");
        }

        var keyparts = keypath.split('.');

        if (!keyparts.every(Boolean)) {
          throw MinimongoError(
            "The update path '" + keypath +
              "' contains an empty field name, which is not allowed.");
        }

        var noCreate = NO_CREATE_MODIFIERS.hasOwnProperty(op);
        var forbidArray = (op === "$rename");
        var target = findModTarget(newDoc, keyparts, {
          noCreate: NO_CREATE_MODIFIERS[op],
          forbidArray: (op === "$rename"),
          arrayIndices: options.arrayIndices
        });
        var field = keyparts.pop();
        modFunc(target, field, arg, keypath, newDoc);
      });
    });
  }

  // move new document into place.
  Object.keys(doc).forEach(function (k) {
    // Note: this used to be for (var k in doc) however, this does not
    // work right in Opera. Deleting from a doc while iterating over it
    // would sometimes cause opera to skip some keys.
    if (k !== '_id')
      delete doc[k];
  });
  Object.keys(newDoc).forEach(function (k) {
    doc[k] = newDoc[k];
  });
};

// for a.b.c.2.d.e, keyparts should be ['a', 'b', 'c', '2', 'd', 'e'],
// and then you would operate on the 'e' property of the returned
// object.
//
// if options.noCreate is falsey, creates intermediate levels of
// structure as necessary, like mkdir -p (and raises an exception if
// that would mean giving a non-numeric property to an array.) if
// options.noCreate is true, return undefined instead.
//
// may modify the last element of keyparts to signal to the caller that it needs
// to use a different value to index into the returned object (for example,
// ['a', '01'] -> ['a', 1]).
//
// if forbidArray is true, return null if the keypath goes through an array.
//
// if options.arrayIndices is set, use its first element for the (first) '$' in
// the path.
var findModTarget = function (doc, keyparts, options) {
  options = options || {};
  var usedArrayIndex = false;
  for (var i = 0; i < keyparts.length; i++) {
    var last = (i === keyparts.length - 1);
    var keypart = keyparts[i];
    var indexable = isIndexable(doc);
    if (!indexable) {
      if (options.noCreate)
        return undefined;
      var e = MinimongoError(
        "cannot use the part '" + keypart + "' to traverse " + doc);
      e.setPropertyError = true;
      throw e;
    }
    if (doc instanceof Array) {
      if (options.forbidArray)
        return null;
      if (keypart === '$') {
        if (usedArrayIndex)
          throw MinimongoError("Too many positional (i.e. '$') elements");
        if (!options.arrayIndices || !options.arrayIndices.length) {
          throw MinimongoError("The positional operator did not find the " +
                               "match needed from the query");
        }
        keypart = options.arrayIndices[0];
        usedArrayIndex = true;
      } else if (isNumericKey(keypart)) {
        keypart = parseInt(keypart);
      } else {
        if (options.noCreate)
          return undefined;
        throw MinimongoError(
          "can't append to array using string field name ["
                    + keypart + "]");
      }
      if (last)
        // handle 'a.01'
        keyparts[i] = keypart;
      if (options.noCreate && keypart >= doc.length)
        return undefined;
      while (doc.length < keypart)
        doc.push(null);
      if (!last) {
        if (doc.length === keypart)
          doc.push({});
        else if (typeof doc[keypart] !== "object")
          throw MinimongoError("can't modify field '" + keyparts[i + 1] +
                      "' of list value " + JSON.stringify(doc[keypart]));
      }
    } else {
      assertIsValidFieldName(keypart);
      if (!(keypart in doc)) {
        if (options.noCreate)
          return undefined;
        if (!last)
          doc[keypart] = {};
      }
    }

    if (last)
      return doc;
    doc = doc[keypart];
  }

  // notreached
};

var NO_CREATE_MODIFIERS = {
  $unset: true,
  $pop: true,
  $rename: true,
  $pull: true,
  $pullAll: true
};

var MODIFIERS = {
  $currentDate: function (target, field, arg) {
    if (typeof arg === "object" && arg.hasOwnProperty("$type")) {
       if (arg.$type !== "date") {
          throw MinimongoError(
            "Minimongo does currently only support the date type " +
            "in $currentDate modifiers",
            { field });
       }
    } else if (arg !== true) {
      throw MinimongoError("Invalid $currentDate modifier", { field });
    }
    target[field] = new Date();
  },
  $min: function (target, field, arg) {
    if (typeof arg !== "number") {
      throw MinimongoError("Modifier $min allowed for numbers only", { field });
    }
    if (field in target) {
      if (typeof target[field] !== "number") {
        throw MinimongoError(
          "Cannot apply $min modifier to non-number", { field });
      }
      if (target[field] > arg) {
        target[field] = arg;
      }
    } else {
      target[field] = arg;
    }
  },
  $max: function (target, field, arg) {
    if (typeof arg !== "number") {
      throw MinimongoError("Modifier $max allowed for numbers only", { field });
    }
    if (field in target) {
      if (typeof target[field] !== "number") {
        throw MinimongoError(
          "Cannot apply $max modifier to non-number", { field });
      }
      if (target[field] < arg) {
         target[field] = arg;
      }
    } else {
      target[field] = arg;
    }
  },
  $inc: function (target, field, arg) {
    if (typeof arg !== "number")
      throw MinimongoError("Modifier $inc allowed for numbers only", { field });
    if (field in target) {
      if (typeof target[field] !== "number")
        throw MinimongoError(
          "Cannot apply $inc modifier to non-number", { field });
      target[field] += arg;
    } else {
      target[field] = arg;
    }
  },
  $set: function (target, field, arg) {
    if (target !== Object(target)) { // not an array or an object
      var e = MinimongoError(
        "Cannot set property on non-object field", { field });
      e.setPropertyError = true;
      throw e;
    }
    if (target === null) {
      var e = MinimongoError("Cannot set property on null", { field });
      e.setPropertyError = true;
      throw e;
    }
    assertHasValidFieldNames(arg);
    target[field] = arg;
  },
  $setOnInsert: function (target, field, arg) {
    // converted to `$set` in `_modify`
  },
  $unset: function (target, field, arg) {
    if (target !== undefined) {
      if (target instanceof Array) {
        if (field in target)
          target[field] = null;
      } else
        delete target[field];
    }
  },
  $push: function (target, field, arg) {
    if (target[field] === undefined)
      target[field] = [];
    if (!(target[field] instanceof Array))
      throw MinimongoError(
        "Cannot apply $push modifier to non-array", { field });

    if (!(arg && arg.$each)) {
      // Simple mode: not $each
      assertHasValidFieldNames(arg);
      target[field].push(arg);
      return;
    }

    // Fancy mode: $each (and maybe $slice and $sort and $position)
    var toPush = arg.$each;
    if (!(toPush instanceof Array))
      throw MinimongoError("$each must be an array", { field });
    assertHasValidFieldNames(toPush);

    // Parse $position
    var position = undefined;
    if ('$position' in arg) {
      if (typeof arg.$position !== "number")
        throw MinimongoError("$position must be a numeric value", { field });
      // XXX should check to make sure integer
      if (arg.$position < 0)
        throw MinimongoError(
          "$position in $push must be zero or positive", { field });
      position = arg.$position;
    }

    // Parse $slice.
    var slice = undefined;
    if ('$slice' in arg) {
      if (typeof arg.$slice !== "number")
        throw MinimongoError("$slice must be a numeric value", { field });
      // XXX should check to make sure integer
      slice = arg.$slice;
    }

    // Parse $sort.
    var sortFunction = undefined;
    if (arg.$sort) {
      if (slice === undefined)
        throw MinimongoError("$sort requires $slice to be present", { field });
      // XXX this allows us to use a $sort whose value is an array, but that's
      // actually an extension of the Node driver, so it won't work
      // server-side. Could be confusing!
      // XXX is it correct that we don't do geo-stuff here?
      sortFunction = new Minimongo.Sorter(arg.$sort).getComparator();
      for (var i = 0; i < toPush.length; i++) {
        if (LocalCollection._f._type(toPush[i]) !== 3) {
          throw MinimongoError("$push like modifiers using $sort " +
                      "require all elements to be objects", { field });
        }
      }
    }

    // Actually push.
    if (position === undefined) {
      for (var j = 0; j < toPush.length; j++)
        target[field].push(toPush[j]);
    } else {
      var spliceArguments = [position, 0];
      for (var j = 0; j < toPush.length; j++)
        spliceArguments.push(toPush[j]);
      Array.prototype.splice.apply(target[field], spliceArguments);
    }

    // Actually sort.
    if (sortFunction)
      target[field].sort(sortFunction);

    // Actually slice.
    if (slice !== undefined) {
      if (slice === 0)
        target[field] = [];  // differs from Array.slice!
      else if (slice < 0)
        target[field] = target[field].slice(slice);
      else
        target[field] = target[field].slice(0, slice);
    }
  },
  $pushAll: function (target, field, arg) {
    if (!(typeof arg === "object" && arg instanceof Array))
      throw MinimongoError("Modifier $pushAll/pullAll allowed for arrays only");
    assertHasValidFieldNames(arg);
    var x = target[field];
    if (x === undefined)
      target[field] = arg;
    else if (!(x instanceof Array))
      throw MinimongoError(
        "Cannot apply $pushAll modifier to non-array", { field });
    else {
      for (var i = 0; i < arg.length; i++)
        x.push(arg[i]);
    }
  },
  $addToSet: function (target, field, arg) {
    var isEach = false;
    if (typeof arg === "object") {
      //check if first key is '$each'
      const keys = Object.keys(arg);
      if (keys[0] === "$each"){
        isEach = true;
      }
    }
    var values = isEach ? arg["$each"] : [arg];
    assertHasValidFieldNames(values);
    var x = target[field];
    if (x === undefined)
      target[field] = values;
    else if (!(x instanceof Array))
      throw MinimongoError(
        "Cannot apply $addToSet modifier to non-array", { field });
    else {
      values.forEach(function (value) {
        for (var i = 0; i < x.length; i++)
          if (LocalCollection._f._equal(value, x[i]))
            return;
        x.push(value);
      });
    }
  },
  $pop: function (target, field, arg) {
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw MinimongoError(
        "Cannot apply $pop modifier to non-array", { field });
    else {
      if (typeof arg === 'number' && arg < 0)
        x.splice(0, 1);
      else
        x.pop();
    }
  },
  $pull: function (target, field, arg) {
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw MinimongoError(
        "Cannot apply $pull/pullAll modifier to non-array", { field });
    else {
      var out = [];
      if (arg != null && typeof arg === "object" && !(arg instanceof Array)) {
        // XXX would be much nicer to compile this once, rather than
        // for each document we modify.. but usually we're not
        // modifying that many documents, so we'll let it slide for
        // now

        // XXX Minimongo.Matcher isn't up for the job, because we need
        // to permit stuff like {$pull: {a: {$gt: 4}}}.. something
        // like {$gt: 4} is not normally a complete selector.
        // same issue as $elemMatch possibly?
        var matcher = new Minimongo.Matcher(arg);
        for (var i = 0; i < x.length; i++)
          if (!matcher.documentMatches(x[i]).result)
            out.push(x[i]);
      } else {
        for (var i = 0; i < x.length; i++)
          if (!LocalCollection._f._equal(x[i], arg))
            out.push(x[i]);
      }
      target[field] = out;
    }
  },
  $pullAll: function (target, field, arg) {
    if (!(typeof arg === "object" && arg instanceof Array))
      throw MinimongoError(
        "Modifier $pushAll/pullAll allowed for arrays only", { field });
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw MinimongoError(
        "Cannot apply $pull/pullAll modifier to non-array", { field });
    else {
      var out = [];
      for (var i = 0; i < x.length; i++) {
        var exclude = false;
        for (var j = 0; j < arg.length; j++) {
          if (LocalCollection._f._equal(x[i], arg[j])) {
            exclude = true;
            break;
          }
        }
        if (!exclude)
          out.push(x[i]);
      }
      target[field] = out;
    }
  },
  $rename: function (target, field, arg, keypath, doc) {
    if (keypath === arg)
      // no idea why mongo has this restriction..
      throw MinimongoError("$rename source must differ from target", { field });
    if (target === null)
      throw MinimongoError("$rename source field invalid", { field });
    if (typeof arg !== "string")
      throw MinimongoError("$rename target must be a string", { field });
    if (arg.indexOf('\0') > -1) {
      // Null bytes are not allowed in Mongo field names
      // https://docs.mongodb.com/manual/reference/limits/#Restrictions-on-Field-Names
      throw MinimongoError(
        "The 'to' field for $rename cannot contain an embedded null byte",
        { field });
    }
    if (target === undefined)
      return;
    var v = target[field];
    delete target[field];

    var keyparts = arg.split('.');
    var target2 = findModTarget(doc, keyparts, {forbidArray: true});
    if (target2 === null)
      throw MinimongoError("$rename target field invalid", { field });
    var field2 = keyparts.pop();
    target2[field2] = v;
  },
  $bit: function (target, field, arg) {
    // XXX mongo only supports $bit on integers, and we only support
    // native javascript numbers (doubles) so far, so we can't support $bit
    throw MinimongoError("$bit is not supported", { field });
  }
};
// ordered: bool.
// old_results and new_results: collections of documents.
//    if ordered, they are arrays.
//    if unordered, they are IdMaps
LocalCollection._diffQueryChanges = function (ordered, oldResults, newResults, observer, options) {
  return DiffSequence.diffQueryChanges(ordered, oldResults, newResults, observer, options);
};

LocalCollection._diffQueryUnorderedChanges = function (oldResults, newResults, observer, options) {
  return DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, observer, options);
};


LocalCollection._diffQueryOrderedChanges =
  function (oldResults, newResults, observer, options) {
  return DiffSequence.diffQueryOrderedChanges(oldResults, newResults, observer, options);
};

LocalCollection._diffObjects = function (left, right, callbacks) {
  return DiffSequence.diffObjects(left, right, callbacks);
};
LocalCollection._IdMap = function () {
  var self = this;
  IdMap.call(self, MongoID.idStringify, MongoID.idParse);
};

Meteor._inherits(LocalCollection._IdMap, IdMap);

// XXX maybe move these into another ObserveHelpers package or something

// _CachingChangeObserver is an object which receives observeChanges callbacks
// and keeps a cache of the current cursor state up to date in self.docs. Users
// of this class should read the docs field but not modify it. You should pass
// the "applyChange" field as the callbacks to the underlying observeChanges
// call. Optionally, you can specify your own observeChanges callbacks which are
// invoked immediately before the docs field is updated; this object is made
// available as `this` to those callbacks.
LocalCollection._CachingChangeObserver = function (options) {
  var self = this;
  options = options || {};

  var orderedFromCallbacks = options.callbacks &&
        LocalCollection._observeChangesCallbacksAreOrdered(options.callbacks);
  if (options.hasOwnProperty('ordered')) {
    self.ordered = options.ordered;
    if (options.callbacks && options.ordered !== orderedFromCallbacks)
      throw Error("ordered option doesn't match callbacks");
  } else if (options.callbacks) {
    self.ordered = orderedFromCallbacks;
  } else {
    throw Error("must provide ordered or callbacks");
  }
  var callbacks = options.callbacks || {};

  if (self.ordered) {
    self.docs = new OrderedDict(MongoID.idStringify);
    self.applyChange = {
      addedBefore: function (id, fields, before) {
        var doc = EJSON.clone(fields);
        doc._id = id;
        callbacks.addedBefore && callbacks.addedBefore.call(
          self, id, fields, before);
        // This line triggers if we provide added with movedBefore.
        callbacks.added && callbacks.added.call(self, id, fields);
        // XXX could `before` be a falsy ID?  Technically
        // idStringify seems to allow for them -- though
        // OrderedDict won't call stringify on a falsy arg.
        self.docs.putBefore(id, doc, before || null);
      },
      movedBefore: function (id, before) {
        var doc = self.docs.get(id);
        callbacks.movedBefore && callbacks.movedBefore.call(self, id, before);
        self.docs.moveBefore(id, before || null);
      }
    };
  } else {
    self.docs = new LocalCollection._IdMap;
    self.applyChange = {
      added: function (id, fields) {
        var doc = EJSON.clone(fields);
        callbacks.added && callbacks.added.call(self, id, fields);
        doc._id = id;
        self.docs.set(id,  doc);
      }
    };
  }

  // The methods in _IdMap and OrderedDict used by these callbacks are
  // identical.
  self.applyChange.changed = function (id, fields) {
    var doc = self.docs.get(id);
    if (!doc)
      throw new Error("Unknown id for changed: " + id);
    callbacks.changed && callbacks.changed.call(
      self, id, EJSON.clone(fields));
    DiffSequence.applyChanges(doc, fields);
  };
  self.applyChange.removed = function (id) {
    callbacks.removed && callbacks.removed.call(self, id);
    self.docs.remove(id);
  };
};

LocalCollection._observeFromObserveChanges = function (cursor, observeCallbacks) {
  var transform = cursor.getTransform() || function (doc) {return doc;};
  var suppressed = !!observeCallbacks._suppress_initial;

  var observeChangesCallbacks;
  if (LocalCollection._observeCallbacksAreOrdered(observeCallbacks)) {
    // The "_no_indices" option sets all index arguments to -1 and skips the
    // linear scans required to generate them.  This lets observers that don't
    // need absolute indices benefit from the other features of this API --
    // relative order, transforms, and applyChanges -- without the speed hit.
    var indices = !observeCallbacks._no_indices;
    observeChangesCallbacks = {
      addedBefore: function (id, fields, before) {
        var self = this;
        if (suppressed || !(observeCallbacks.addedAt || observeCallbacks.added))
          return;
        var doc = transform(Object.assign(fields, {_id: id}));
        if (observeCallbacks.addedAt) {
          var index = indices
                ? (before ? self.docs.indexOf(before) : self.docs.size()) : -1;
          observeCallbacks.addedAt(doc, index, before);
        } else {
          observeCallbacks.added(doc);
        }
      },
      changed: function (id, fields) {
        var self = this;
        if (!(observeCallbacks.changedAt || observeCallbacks.changed))
          return;
        var doc = EJSON.clone(self.docs.get(id));
        if (!doc)
          throw new Error("Unknown id for changed: " + id);
        var oldDoc = transform(EJSON.clone(doc));
        DiffSequence.applyChanges(doc, fields);
        doc = transform(doc);
        if (observeCallbacks.changedAt) {
          var index = indices ? self.docs.indexOf(id) : -1;
          observeCallbacks.changedAt(doc, oldDoc, index);
        } else {
          observeCallbacks.changed(doc, oldDoc);
        }
      },
      movedBefore: function (id, before) {
        var self = this;
        if (!observeCallbacks.movedTo)
          return;
        var from = indices ? self.docs.indexOf(id) : -1;

        var to = indices
              ? (before ? self.docs.indexOf(before) : self.docs.size()) : -1;
        // When not moving backwards, adjust for the fact that removing the
        // document slides everything back one slot.
        if (to > from)
          --to;
        observeCallbacks.movedTo(transform(EJSON.clone(self.docs.get(id))),
                                 from, to, before || null);
      },
      removed: function (id) {
        var self = this;
        if (!(observeCallbacks.removedAt || observeCallbacks.removed))
          return;
        // technically maybe there should be an EJSON.clone here, but it's about
        // to be removed from self.docs!
        var doc = transform(self.docs.get(id));
        if (observeCallbacks.removedAt) {
          var index = indices ? self.docs.indexOf(id) : -1;
          observeCallbacks.removedAt(doc, index);
        } else {
          observeCallbacks.removed(doc);
        }
      }
    };
  } else {
    observeChangesCallbacks = {
      added: function (id, fields) {
        if (!suppressed && observeCallbacks.added) {
          var doc = Object.assign(fields, {_id: id});
          observeCallbacks.added(transform(doc));
        }
      },
      changed: function (id, fields) {
        var self = this;
        if (observeCallbacks.changed) {
          var oldDoc = self.docs.get(id);
          var doc = EJSON.clone(oldDoc);
          DiffSequence.applyChanges(doc, fields);
          observeCallbacks.changed(transform(doc),
                                   transform(EJSON.clone(oldDoc)));
        }
      },
      removed: function (id) {
        var self = this;
        if (observeCallbacks.removed) {
          observeCallbacks.removed(transform(self.docs.get(id)));
        }
      }
    };
  }

  var changeObserver = new LocalCollection._CachingChangeObserver(
    {callbacks: observeChangesCallbacks});
  var handle = cursor.observeChanges(changeObserver.applyChange);
  suppressed = false;

  return handle;
};
// Is this selector just shorthand for lookup by _id?
LocalCollection._selectorIsId = function (selector) {
  return (typeof selector === "string") ||
    (typeof selector === "number") ||
    selector instanceof MongoID.ObjectID;
};

// Is the selector just lookup by _id (shorthand or not)?
LocalCollection._selectorIsIdPerhapsAsObject = function (selector) {
  return LocalCollection._selectorIsId(selector) ||
    (selector && typeof selector === "object" &&
     selector._id && LocalCollection._selectorIsId(selector._id) &&
     Object.keys(selector).length === 1);
};

// If this is a selector which explicitly constrains the match by ID to a finite
// number of documents, returns a list of their IDs.  Otherwise returns
// null. Note that the selector may have other restrictions so it may not even
// match those document!  We care about $in and $and since those are generated
// access-controlled update and remove.
LocalCollection._idsMatchedBySelector = function (selector) {
  // Is the selector just an ID?
  if (LocalCollection._selectorIsId(selector))
    return [selector];
  if (!selector)
    return null;

  // Do we have an _id clause?
  if (selector.hasOwnProperty('_id')) {
    // Is the _id clause just an ID?
    if (LocalCollection._selectorIsId(selector._id))
      return [selector._id];
    // Is the _id clause {_id: {$in: ["x", "y", "z"]}}?
    if (selector._id && selector._id.$in
        && Array.isArray(selector._id.$in)
        && selector._id.$in.length
        && selector._id.$in.every(LocalCollection._selectorIsId)) {
      return selector._id.$in;
    }
    return null;
  }

  // If this is a top-level $and, and any of the clauses constrain their
  // documents, then the whole selector is constrained by any one clause's
  // constraint. (Well, by their intersection, but that seems unlikely.)
  if (selector.$and && Array.isArray(selector.$and)) {
    for (var i = 0; i < selector.$and.length; ++i) {
      var subIds = LocalCollection._idsMatchedBySelector(selector.$and[i]);
      if (subIds)
        return subIds;
    }
  }

  return null;
};


