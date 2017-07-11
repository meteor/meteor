import {LocalCollection} from './local_collection.js';
import {Matcher} from './matcher.js';
import {
  isIndexable,
  isNumericKey,
  isOperatorObject,
} from './common.js';


// XXX type checking on selectors (graceful error if malformed)

// LocalCollection: a set of documents that supports queries and modifiers.

// Cursor: a specification for a particular subset of documents, w/
// a defined order, limit, and offset.  creating a Cursor with LocalCollection.find(),

// ObserveHandle: the return value of a live query.

Minimongo = {LocalCollection, Matcher};

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

/**
 * @summary Watch a query.  Receive callbacks as the result set changes.
 * @locus Anywhere
 * @memberOf Mongo.Cursor
 * @instance
 * @param {Object} callbacks Functions to call to deliver the result set as it changes
 */
LocalCollection.Cursor.prototype.observe = function (options) {
  var self = this;
  return LocalCollection._observeFromObserveChanges(self, options);
};

/**
 * @summary Watch a query.  Receive callbacks as the result set changes.  Only the differences between the old and new documents are passed to the callbacks.
 * @locus Anywhere
 * @memberOf Mongo.Cursor
 * @instance
 * @param {Object} callbacks Functions to call to deliver the result set as it changes
 */
LocalCollection.Cursor.prototype.observeChanges = function (options) {
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
};

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
function composeComparators (comparatorArray) {
  return function (a, b) {
    for (var i = 0; i < comparatorArray.length; ++i) {
      var compare = comparatorArray[i](a, b);
      if (compare !== 0)
        return compare;
    }
    return 0;
  };
}
