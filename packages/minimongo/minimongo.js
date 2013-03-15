(function () {

// XXX type checking on selectors (graceful error if malformed)

// LocalCollection: a set of documents that supports queries and modifiers.

// Cursor: a specification for a particular subset of documents, w/
// a defined order, limit, and offset.  creating a Cursor with LocalCollection.find(),

// LiveResultsSet: the return value of a live query.

LocalCollection = function () {
  this.docs = {}; // _id -> document (also containing id)

  this.next_qid = 1; // live query id generator

  // qid -> live query object. keys:
  //  ordered: bool. ordered queries have moved callbacks and callbacks
  //           take indices.
  //  results: array (ordered) or object (unordered) of current results
  //  results_snapshot: snapshot of results. null if not paused.
  //  cursor: Cursor object for the query.
  //  selector_f, sort_f, (callbacks): functions
  this.queries = {};

  // null if not saving originals; a map from id to original document value if
  // saving originals. See comments before saveOriginals().
  this._savedOriginals = null;

  // True when observers are paused and we should not send callbacks.
  this.paused = false;
};


LocalCollection._applyChanges = function (doc, changeFields) {
  _.each(changeFields, function (value, key) {
    if (value === undefined)
      delete doc[key];
    else
      doc[key] = value;
  });
};

LocalCollection.MinimongoError = function (message) {
  var self = this;
  self.name = "MinimongoError";
  self.details = message;
};

LocalCollection.MinimongoError.prototype = new Error;


// options may include sort, skip, limit, reactive
// sort may be any of these forms:
//     {a: 1, b: -1}
//     [["a", "asc"], ["b", "desc"]]
//     ["a", ["b", "desc"]]
//   (in the first form you're beholden to key enumeration order in
//   your javascript VM)
//
// reactive: if given, and false, don't register with Deps (default
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

  this.collection = collection;

  if (LocalCollection._selectorIsId(selector)) {
    // stash for fast path
    self.selector_id = LocalCollection._idStringify(selector);
    self.selector_f = LocalCollection._compileSelector(selector);
    self.sort_f = undefined;
  } else {
    self.selector_id = undefined;
    self.selector_f = LocalCollection._compileSelector(selector);
    self.sort_f = options.sort ? LocalCollection._compileSort(options.sort) : null;
  }
  self.skip = options.skip;
  self.limit = options.limit;
  if (options.transform && typeof Deps !== "undefined")
    self._transform = Deps._makeNonreactive(options.transform);
  else
    self._transform = options.transform;

  // db_objects is a list of the objects that match the cursor. (It's always a
  // list, never an object: LocalCollection.Cursor is always ordered.)
  self.db_objects = null;
  self.cursor_pos = 0;

  // by default, queries register w/ Deps when it is available.
  if (typeof Deps !== "undefined")
    self.reactive = (options.reactive === undefined) ? true : options.reactive;
};

LocalCollection.Cursor.prototype.rewind = function () {
  var self = this;
  self.db_objects = null;
  self.cursor_pos = 0;
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

LocalCollection.Cursor.prototype.forEach = function (callback) {
  var self = this;
  var doc;

  if (self.db_objects === null)
    self.db_objects = self._getRawObjects(true);

  if (self.reactive)
    self._depend({
      addedBefore: true,
      removed: true,
      changed: true,
      movedBefore: true});

  while (self.cursor_pos < self.db_objects.length) {
    var elt = EJSON.clone(self.db_objects[self.cursor_pos++]);
    if (self._transform)
      elt = self._transform(elt);
    callback(elt);
  }
};

LocalCollection.Cursor.prototype.getTransform = function () {
  var self = this;
  return self._transform;
};

LocalCollection.Cursor.prototype.map = function (callback) {
  var self = this;
  var res = [];
  self.forEach(function (doc) {
    res.push(callback(doc));
  });
  return res;
};

LocalCollection.Cursor.prototype.fetch = function () {
  var self = this;
  var res = [];
  self.forEach(function (doc) {
    res.push(doc);
  });
  return res;
};

LocalCollection.Cursor.prototype.count = function () {
  var self = this;

  if (self.reactive)
    self._depend({added: true, removed: true});

  if (self.db_objects === null)
    self.db_objects = self._getRawObjects(true);

  return self.db_objects.length;
};

LocalCollection._isOrderedChanges = function (callbacks) {
  if (callbacks.added && callbacks.addedBefore)
    throw new Error("Please specify only one of added() and addedBefore()");
  return typeof callbacks.addedBefore == 'function' ||
    typeof callbacks.movedBefore === 'function';
};

// the handle that comes back from observe.
LocalCollection.LiveResultsSet = function () {};

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
// LocalCollection.LiveResultsSet) is true
//
// initial results delivered through added callback
// XXX maybe callbacks should take a list of objects, to expose transactions?
// XXX maybe support field limiting (to limit what you're notified on)

_.extend(LocalCollection.Cursor.prototype, {
  observe: function (options) {
    var self = this;
    return LocalCollection._observeFromObserveChanges(self, options);
  },
  observeChanges: function (options) {
    var self = this;

    var ordered = LocalCollection._isOrderedChanges(options);

    if (!ordered && (self.skip || self.limit))
      throw new Error("must use ordered observe with skip or limit");

    // XXX merge this object w/ "this" Cursor.  they're the same.
    var query = {
      selector_f: self.selector_f, // not fast pathed
      sort_f: ordered && self.sort_f,
      results_snapshot: null,
      ordered: ordered,
      cursor: this,
      observeChanges: options.observeChanges
    };
    var qid;

    // Non-reactive queries call added[Before] and then never call anything
    // else.
    if (self.reactive) {
      qid = self.collection.next_qid++;
      self.collection.queries[qid] = query;
    }
    query.results = self._getRawObjects(ordered);
    if (self.collection.paused)
      query.results_snapshot = (ordered ? [] : {});

    // wrap callbacks we were passed. callbacks only fire when not paused and
    // are never undefined (except that query.moved is undefined for unordered
    // callbacks).
    var if_not_paused = function (f) {
      if (!f)
        return function () {};
      return function (/*args*/) {
        if (!self.collection.paused)
          f.apply(this, arguments);
      };
    };
    query.added = if_not_paused(options.added);
    query.changed = if_not_paused(options.changed);
    query.removed = if_not_paused(options.removed);
    if (ordered) {
      query.moved = if_not_paused(options.moved);
      query.addedBefore = if_not_paused(options.addedBefore);
      query.movedBefore = if_not_paused(options.movedBefore);
    }

    if (!options._suppress_initial && !self.collection.paused) {
      _.each(query.results, function (doc, i) {
        var fields = EJSON.clone(doc);
        delete fields._id;
        if (ordered)
          query.addedBefore(doc._id, fields, null);
        query.added(doc._id, fields);
      });
    }

    var handle = new LocalCollection.LiveResultsSet;
    _.extend(handle, {
      collection: self.collection,
      stop: function () {
        if (self.reactive)
          delete self.collection.queries[qid];
      }
    });

    if (self.reactive && Deps.active) {
      // XXX in many cases, the same observe will be recreated when
      // the current autorun is rerun.  we could save work by
      // letting it linger across rerun and potentially get
      // repurposed if the same observe is performed, using logic
      // similar to that of Meteor.subscribe.
      Deps.onInvalidate(function () {
        handle.stop();
      });
    }

    return handle;
  }
});

// Returns a collection of matching objects, but doesn't deep copy them.
//
// If ordered is set, returns a sorted array, respecting sort_f, skip, and limit
// properties of the query.  if sort_f is falsey, no sort -- you get the natural
// order.
//
// If ordered is not set, returns an object mapping from ID to doc (sort_f, skip
// and limit should not be set).
LocalCollection.Cursor.prototype._getRawObjects = function (ordered) {
  var self = this;

  var results = ordered ? [] : {};

  // fast path for single ID value
  if (self.selector_id) {
    // If you have non-zero skip and ask for a single id, you get
    // nothing. This is so it matches the behavior of the '{_id: foo}'
    // path.
    if (self.skip)
      return results;

    if (_.has(self.collection.docs, self.selector_id)) {
      var selectedDoc = self.collection.docs[self.selector_id];
      if (ordered)
        results.push(selectedDoc);
      else
        results[self.selector_id] = selectedDoc;
    }
    return results;
  }

  // slow path for arbitrary selector, sort, skip, limit
  for (var id in self.collection.docs) {
    var doc = self.collection.docs[id];
    if (self.selector_f(doc)) {
      if (ordered)
        results.push(doc);
      else
        results[id] = doc;
    }
    // Fast path for limited unsorted queries.
    if (self.limit && !self.skip && !self.sort_f &&
        results.length === self.limit)
      return results;
  }

  if (!ordered)
    return results;

  if (self.sort_f)
    results.sort(self.sort_f);

  var idx_start = self.skip || 0;
  var idx_end = self.limit ? (self.limit + idx_start) : results.length;
  return results.slice(idx_start, idx_end);
};

// XXX Maybe we need a version of observe that just calls a callback if
// anything changed.
LocalCollection.Cursor.prototype._depend = function (changers) {
  var self = this;

  if (Deps.active) {
    var v = new Deps.Dependency;
    Deps.depend(v);
    var notifyChange = _.bind(v.changed, v);

    var options = {_suppress_initial: true};
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
LocalCollection.prototype.insert = function (doc) {
  var self = this;
  doc = EJSON.clone(doc);

  if (!_.has(doc, '_id')) {
    // if you really want to use ObjectIDs, set this global.
    // Meteor.Collection specifies its own ids and does not use this code.
    doc._id = LocalCollection._useOID ? new LocalCollection._ObjectID()
                                      : Random.id();
  }
  var id = LocalCollection._idStringify(doc._id);

  if (_.has(self.docs, doc._id))
    throw new LocalCollection.MinimongoError("Duplicate _id '" + doc._id + "'");

  self._saveOriginal(id, undefined);
  self.docs[id] = doc;

  var queriesToRecompute = [];
  // trigger live queries that match
  for (var qid in self.queries) {
    var query = self.queries[qid];
    if (query.selector_f(doc)) {
      if (query.cursor.skip || query.cursor.limit)
        queriesToRecompute.push(qid);
      else
        LocalCollection._insertInResults(query, doc);
    }
  }

  _.each(queriesToRecompute, function (qid) {
    if (self.queries[qid])
      LocalCollection._recomputeResults(self.queries[qid]);
  });
};

LocalCollection.prototype.remove = function (selector) {
  var self = this;
  var remove = [];

  var queriesToRecompute = [];
  var selector_f = LocalCollection._compileSelector(selector);

  // Avoid O(n) for "remove a single doc by ID".
  var specificIds = LocalCollection._idsMatchedBySelector(selector);
  if (specificIds) {
    _.each(specificIds, function (id) {
      var strId = LocalCollection._idStringify(id);
      // We still have to run selector_f, in case it's something like
      //   {_id: "X", a: 42}
      if (_.has(self.docs, strId) && selector_f(self.docs[strId]))
        remove.push(strId);
    });
  } else {
    for (var id in self.docs) {
      var doc = self.docs[id];
      if (selector_f(doc)) {
        remove.push(id);
      }
    }
  }

  var queryRemove = [];
  for (var i = 0; i < remove.length; i++) {
    var removeId = remove[i];
    var removeDoc = self.docs[removeId];
    _.each(self.queries, function (query, qid) {
      if (query.selector_f(removeDoc)) {
        if (query.cursor.skip || query.cursor.limit)
          queriesToRecompute.push(qid);
        else
          queryRemove.push({qid: qid, doc: removeDoc});
      }
    });
    self._saveOriginal(removeId, removeDoc);
    delete self.docs[removeId];
  }

  // run live query callbacks _after_ we've removed the documents.
  _.each(queryRemove, function (remove) {
    var query = self.queries[remove.qid];
    if (query)
      LocalCollection._removeFromResults(query, remove.doc);
  });
  _.each(queriesToRecompute, function (qid) {
    var query = self.queries[qid];
    if (query)
      LocalCollection._recomputeResults(query);
  });
};

// XXX atomicity: if multi is true, and one modification fails, do
// we rollback the whole operation, or what?
LocalCollection.prototype.update = function (selector, mod, options) {
  var self = this;
  if (!options) options = {};

  if (options.upsert)
    throw new Error("upsert not yet implemented");

  var selector_f = LocalCollection._compileSelector(selector);

  // Save the original results of any query that we might need to
  // _recomputeResults on, because _modifyAndNotify will mutate the objects in
  // it. (We don't need to save the original results of paused queries because
  // they already have a results_snapshot and we won't be diffing in
  // _recomputeResults.)
  var qidToOriginalResults = {};
  _.each(self.queries, function (query, qid) {
    if ((query.cursor.skip || query.cursor.limit) && !query.paused)
      qidToOriginalResults[qid] = EJSON.clone(query.results);
  });
  var recomputeQids = {};

  for (var id in self.docs) {
    var doc = self.docs[id];
    if (selector_f(doc)) {
      // XXX Should we save the original even if mod ends up being a no-op?
      self._saveOriginal(id, doc);
      self._modifyAndNotify(doc, mod, recomputeQids);
      if (!options.multi)
        break;
    }
  }

  _.each(recomputeQids, function (dummy, qid) {
    var query = self.queries[qid];
    if (query)
      LocalCollection._recomputeResults(query,
                                        qidToOriginalResults[qid]);
  });
};

LocalCollection.prototype._modifyAndNotify = function (
    doc, mod, recomputeQids) {
  var self = this;

  var matched_before = {};
  for (var qid in self.queries) {
    var query = self.queries[qid];
    if (query.ordered) {
      matched_before[qid] = query.selector_f(doc);
    } else {
      // Because we don't support skip or limit (yet) in unordered queries, we
      // can just do a direct lookup.
      matched_before[qid] = _.has(query.results,
                                  LocalCollection._idStringify(doc._id));
    }
  }

  var old_doc = EJSON.clone(doc);

  LocalCollection._modify(doc, mod);

  for (qid in self.queries) {
    query = self.queries[qid];
    var before = matched_before[qid];
    var after = query.selector_f(doc);

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
    if (!query.sort_f) {
      query.addedBefore(doc._id, fields, null);
      query.results.push(doc);
    } else {
      var i = LocalCollection._insertInSortedList(
        query.sort_f, query.results, doc);
      var next = query.results[i+1];
      if (next)
        next = next._id;
      else
        next = null;
      query.addedBefore(doc._id, fields, next);
    }
    query.added(doc._id, fields);
  } else {
    query.added(doc._id, fields);
    query.results[LocalCollection._idStringify(doc._id)] = doc;
  }
};

LocalCollection._removeFromResults = function (query, doc) {
  if (query.ordered) {
    var i = LocalCollection._findInOrderedResults(query, doc);
    query.removed(doc._id);
    query.results.splice(i, 1);
  } else {
    var id = LocalCollection._idStringify(doc._id);  // in case callback mutates doc
    query.removed(doc._id);
    delete query.results[id];
  }
};

LocalCollection._updateInResults = function (query, doc, old_doc) {
  if (!EJSON.equals(doc._id, old_doc._id))
    throw new Error("Can't change a doc's _id while updating");
  var changedFields = LocalCollection._makeChangedFields(doc, old_doc);
  if (!query.ordered) {
    if (!_.isEmpty(changedFields)) {
      query.changed(doc._id, changedFields);
      query.results[LocalCollection._idStringify(doc._id)] = doc;
    }
    return;
  }

  var orig_idx = LocalCollection._findInOrderedResults(query, doc);

  if (!_.isEmpty(changedFields))
    query.changed(doc._id, changedFields);
  if (!query.sort_f)
    return;

  // just take it out and put it back in again, and see if the index
  // changes
  query.results.splice(orig_idx, 1);
  var new_idx = LocalCollection._insertInSortedList(
    query.sort_f, query.results, doc);
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
LocalCollection._recomputeResults = function (query, oldResults) {
  if (!oldResults)
    oldResults = query.results;
  query.results = query.cursor._getRawObjects(query.ordered);

  if (!query.paused) {
    LocalCollection._diffQueryChanges(
      query.ordered, oldResults, query.results, query);
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

LocalCollection._insertInSortedList = function (cmp, array, value) {
  if (array.length === 0) {
    array.push(value);
    return 0;
  }

  for (var i = 0; i < array.length; i++) {
    if (cmp(value, array[i]) < 0) {
      array.splice(i, 0, value);
      return i;
    }
  }

  array.push(value);
  return array.length - 1;
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
  self._savedOriginals = {};
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
  if (_.has(self._savedOriginals, id))
    return;
  self._savedOriginals[id] = EJSON.clone(doc);
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

    query.results_snapshot = EJSON.clone(query.results);
  }
};

// Resume the observers. Observers immediately receive change
// notifications to bring them to the current state of the
// database. Note that this is not just replaying all the changes that
// happened during the pause, it is a smarter 'coalesced' diff.
LocalCollection.prototype.resumeObservers = function () {
  // No-op if not paused.
  if (!this.paused)
    return;

  // Unset the 'paused' flag. Make sure to do this first, otherwise
  // observer methods won't actually fire when we trigger them.
  this.paused = false;

  for (var qid in this.queries) {
    var query = this.queries[qid];
    // Diff the current results against the snapshot and send to observers.
    // pass the query object for its observer callbacks.
    LocalCollection._diffQueryChanges(
      query.ordered, query.results_snapshot, query.results, query);
    query.results_snapshot = null;
  }
};


LocalCollection._idStringify = function (id) {
  if (id instanceof LocalCollection._ObjectID) {
    return id.valueOf();
  } else if (typeof id === 'string') {
    if (id === "") {
      return id;
    } else if (id.substr(0, 1) === "-" || // escape previously dashed strings
               id.substr(0, 1) === "~" || // escape escaped numbers, true, false
               LocalCollection._looksLikeObjectID(id) || // escape object-id-form strings
               id.substr(0, 1) === '{') { // escape object-form strings, for maybe implementing later
      return "-" + id;
    } else {
      return id; // other strings go through unchanged.
    }
  } else if (id === undefined) {
    return '-';
  } else if (typeof id === 'object') {
    throw new Error("Meteor does not currently support objects other than ObjectID as ids");
  } else { // Numbers, true, false, null
    return "~" + JSON.stringify(id);
  }
};



LocalCollection._idParse = function (id) {
  if (id === "") {
    return id;
  } else if (id === '-') {
    return undefined;
  } else if (id.substr(0, 1) === '-') {
    return id.substr(1);
  } else if (id.substr(0, 1) === '~') {
    return JSON.parse(id.substr(1));
  } else if (LocalCollection._looksLikeObjectID(id)) {
    return new LocalCollection._ObjectID(id);
  } else {
    return id;
  }
};

if (typeof Meteor !== 'undefined') {
  Meteor.idParse = LocalCollection._idParse;
  Meteor.idStringify = LocalCollection._idStringify;
}

LocalCollection._makeChangedFields = function (newDoc, oldDoc) {
  var fields = {};
  LocalCollection._diffObjects(oldDoc, newDoc, {
    leftOnly: function (key, value) {
      fields[key] = undefined;
    },
    rightOnly: function (key, value) {
      fields[key] = value;
    },
    both: function (key, leftValue, rightValue) {
      if (!EJSON.equals(leftValue, rightValue))
        fields[key] = rightValue;
    }
  });
  return fields;
};

LocalCollection._observeFromObserveChanges = function (cursor, callbacks) {
  var transform = cursor.getTransform();
  if (!transform)
    transform = function (doc) {return doc;};
  if (callbacks.addedAt && callbacks.added)
    throw new Error("Please specify only one of added() and addedAt()");
  if (callbacks.changedAt && callbacks.changed)
    throw new Error("Please specify only one of changed() and changedAt()");
  if (callbacks.removed && callbacks.removedAt)
    throw new Error("Please specify only one of removed() and removedAt()");
  if (callbacks.addedAt || callbacks.movedTo ||
      callbacks.changedAt || callbacks.removedAt)
    return LocalCollection._observeOrderedFromObserveChanges(cursor, callbacks, transform);
  else
    return LocalCollection._observeUnorderedFromObserveChanges(cursor, callbacks, transform);
};

LocalCollection._observeUnorderedFromObserveChanges =
    function (cursor, callbacks, transform) {
  var docs = {};
  var suppressed = !!callbacks._suppress_initial;
  var handle = cursor.observeChanges({
    added: function (id, fields) {
      var strId = LocalCollection._idStringify(id);
      var doc = EJSON.clone(fields);
      doc._id = id;
      docs[strId] = doc;
      suppressed || callbacks.added && callbacks.added(transform(doc));
    },
    changed: function (id, fields) {
      var strId = LocalCollection._idStringify(id);
      var doc = docs[strId];
      var oldDoc = EJSON.clone(doc);
      // writes through to the doc set
      LocalCollection._applyChanges(doc, fields);
      suppressed || callbacks.changed && callbacks.changed(transform(doc), transform(oldDoc));
    },
    removed: function (id) {
      var strId = LocalCollection._idStringify(id);
      var doc = docs[strId];
      delete docs[strId];
      suppressed || callbacks.removed && callbacks.removed(transform(doc));
    }
  });
  suppressed = false;
  return handle;
};

LocalCollection._observeOrderedFromObserveChanges =
    function (cursor, callbacks, transform) {
  var docs = new OrderedDict(LocalCollection._idStringify);
  var suppressed = !!callbacks._suppress_initial;
  var handle = cursor.observeChanges({
    addedBefore: function (id, fields, before) {
      var doc = EJSON.clone(fields);
      doc._id = id;
      docs.putBefore(id, doc, before ? before : null);
      if (!suppressed) {
        if (callbacks.addedAt) {
          var index = docs.indexOf(id);
          callbacks.addedAt(transform(EJSON.clone(doc)),
                            index, before);
        } else if (callbacks.added) {
          callbacks.added(transform(EJSON.clone(doc)));
        }
      }
    },
    changed: function (id, fields) {
      var doc = docs.get(id);
      if (!doc)
        throw new Error("Unknown id for changed: " + id);
      var oldDoc = EJSON.clone(doc);
      // writes through to the doc set
      LocalCollection._applyChanges(doc, fields);
      if (callbacks.changedAt) {
        var index = docs.indexOf(id);
        callbacks.changedAt(transform(EJSON.clone(doc)),
                            transform(oldDoc), index);
      } else if (callbacks.changed) {
        callbacks.changed(transform(EJSON.clone(doc)),
                          transform(oldDoc));
      }
    },
    movedBefore: function (id, before) {
      var doc = docs.get(id);
      var from;
      // only capture indexes if we're going to call the callback that needs them.
      if (callbacks.movedTo)
        from = docs.indexOf(id);
      docs.moveBefore(id, before ? before : null);
      if (callbacks.movedTo) {
        var to = docs.indexOf(id);
        callbacks.movedTo(transform(EJSON.clone(doc)), from, to);
      } else if (callbacks.moved) {
        callbacks.moved(transform(EJSON.clone(doc)));
      }

    },
    removed: function (id) {
      var doc = docs.get(id);
      var index;
      if (callbacks.removedAt)
        index = docs.indexOf(id);
      docs.remove(id);
      callbacks.removedAt && callbacks.removedAt(transform(doc), index);
      callbacks.removed && callbacks.removed(transform(doc));
    }
  });
  suppressed = false;
  return handle;
};
})();
