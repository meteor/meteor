// XXX type checking on selectors (graceful error if malformed)

// LocalCollection: a set of documents that supports queries and modifiers.

// Cursor: a specification for a particular subset of documents, w/
// a defined order, limit, and offset.  creating a Cursor with LocalCollection.find(),

// LiveResultsSet: the return value of a live query.

LocalCollection = function () {
  this.docs = {}; // _id -> document (also containing id)

  this.next_qid = 1; // live query id generator

  // qid -> live query object. keys:
  //  results: array of current results
  //  results_snapshot: snapshot of results. null if not paused.
  //  cursor: Cursor object for the query.
  //  selector_f, sort_f, (callbacks): functions
  this.queries = {};

  // when we have a snapshot, this will contain a deep copy of 'docs'.
  this.current_snapshot = null;

  // True when observers are paused and we should not send callbacks.
  this.paused = false;
};

// options may include sort, skip, limit, reactive
// sort may be any of these forms:
//     {a: 1, b: -1}
//     [["a", "asc"], ["b", "desc"]]
//     ["a", ["b", "desc"]]
//   (in the first form you're beholden to key enumeration order in
//   your javascript VM)
//
// reactive: if given, and false, don't register with Meteor.deps (default
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
  if (!options) options = {};

  this.collection = collection;

  if ((typeof selector === "string") || (typeof selector === "number")) {
    // stash for fast path
    this.selector_id = selector;
    this.selector_f = LocalCollection._compileSelector(selector);
  } else {
    this.selector_f = LocalCollection._compileSelector(selector);
    this.sort_f = options.sort ? LocalCollection._compileSort(options.sort) : null;
    this.skip = options.skip;
    this.limit = options.limit;
  }

  this.db_objects = null;
  this.cursor_pos = 0;

  // by default, queries register w/ Meteor.deps when it is available.
  if (typeof Meteor === "object" && Meteor.deps)
    this.reactive = (options.reactive === undefined) ? true : options.reactive;
};

LocalCollection.Cursor.prototype.rewind = function () {
  var self = this;
  self.db_objects = null;
  self.cursor_pos = 0;
};

LocalCollection.prototype.findOne = function (selector, options) {
  if (arguments.length === 0)
    selector = {};

  // XXX disable limit here so that we can observe findOne() cursor,
  // as required by markAsReactive.
  // options = options || {};
  // options.limit = 1;
  return this.find(selector, options).fetch()[0];
};

LocalCollection.Cursor.prototype.forEach = function (callback) {
  var self = this;
  var doc;

  if (self.db_objects === null)
    self.db_objects = self._getRawObjects();

  if (self.reactive)
    self._markAsReactive({added: true,
                          removed: true,
                          changed: true,
                          moved: true});

  while (self.cursor_pos < self.db_objects.length)
    callback(LocalCollection._deepcopy(self.db_objects[self.cursor_pos++]));
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
    self._markAsReactive({added: true, removed: true});

  if (self.db_objects === null)
    self.db_objects = self._getRawObjects();

  return self.db_objects.length;
};

// the handle that comes back from observe.
LocalCollection.LiveResultsSet = function () {};

// options to contain:
//  * callbacks:
//    - added (object, before_index)
//    - changed (new_object, at_index, old_object)
//    - moved (object, old_index, new_index) - can only fire with changed()
//    - removed (id, at_index, object)
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
// XXX maybe support limit/skip
// XXX it'd be helpful if removed got the object that just left the
// query, not just its id

LocalCollection.Cursor.prototype.observe = function (options) {
  var self = this;

  if (self.skip || self.limit)
    throw new Error("cannot observe queries with skip or limit");

  var qid = self.collection.next_qid++;

  // XXX merge this object w/ "this" Cursor.  they're the same.
  var query = self.collection.queries[qid] = {
    selector_f: self.selector_f, // not fast pathed
    sort_f: self.sort_f,
    results: [],
    results_snapshot: self.collection.paused ? [] : null,
    cursor: this
  };
  query.results = self._getRawObjects();

  // wrap callbacks we were passed. callbacks only fire when not paused
  // and are never undefined.
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
  query.moved = if_not_paused(options.moved);
  query.removed = if_not_paused(options.removed);

  if (!options._suppress_initial && !self.collection.paused)
    for (var i = 0; i < query.results.length; i++)
      query.added(LocalCollection._deepcopy(query.results[i]), i);

  var handle = new LocalCollection.LiveResultsSet;
  _.extend(handle, {
    collection: self.collection,
    stop: function () {
      delete self.collection.queries[qid];
    }
  });
  return handle;
};

// constructs sorted array of matching objects, but doesn't copy them.
// respects sort, skip, and limit properties of the query.
// if sort_f is falsey, no sort -- you get the natural order
LocalCollection.Cursor.prototype._getRawObjects = function () {
  var self = this;

  // fast path for single ID value
  if (self.selector_id && (self.selector_id in self.collection.docs))
    return [self.collection.docs[self.selector_id]];

  // slow path for arbitrary selector, sort, skip, limit
  var results = [];
  for (var id in self.collection.docs) {
    var doc = self.collection.docs[id];
    if (self.selector_f(doc))
      results.push(doc);
  }

  if (self.sort_f)
    results.sort(self.sort_f);

  var idx_start = self.skip || 0;
  var idx_end = self.limit ? (self.limit + idx_start) : results.length;
  return results.slice(idx_start, idx_end);
};

LocalCollection.Cursor.prototype._markAsReactive = function (options) {
  var self = this;

  var context = Meteor.deps.Context.current;

  if (context) {
    var invalidate = _.bind(context.invalidate, context);

    var handle = self.observe({added: options.added && invalidate,
                               removed: options.removed && invalidate,
                               changed: options.changed && invalidate,
                               moved: options.moved && invalidate,
                               _suppress_initial: true});

    // XXX in many cases, the query will be immediately
    // recreated. so we might want to let it linger for a little
    // while and repurpose it if it comes back. this will save us
    // work because we won't have to redo the initial find.
    context.on_invalidate(handle.stop);
  }
};

// XXX enforce rule that field names can't start with '$' or contain '.'
// (real mongodb does in fact enforce this)
// XXX possibly enforce that 'undefined' does not appear (we assume
// this in our handling of null and $exists)
LocalCollection.prototype.insert = function (doc) {
  var self = this;
  doc = LocalCollection._deepcopy(doc);
  // XXX deal with mongo's binary id type?
  if (!('_id' in doc))
    doc._id = LocalCollection.uuid();
  // XXX check to see that there is no object with this _id yet?
  self.docs[doc._id] = doc;

  // trigger live queries that match
  for (var qid in self.queries) {
    var query = self.queries[qid];
    if (query.selector_f(doc))
      LocalCollection._insertInResults(query, doc);
  }
};

LocalCollection.prototype.remove = function (selector) {
  var self = this;
  var remove = [];
  var query_remove = [];

  var selector_f = LocalCollection._compileSelector(selector);
  for (var id in self.docs) {
    var doc = self.docs[id];
    if (selector_f(doc)) {
      remove.push(id);
      for (var qid in self.queries) {
        var query = self.queries[qid];
        if (query.selector_f(doc))
          query_remove.push([query, doc]);
      }
    }
  }
  for (var i = 0; i < remove.length; i++) {
    delete self.docs[remove[i]];
  }

  // run live query callbacks _after_ we've removed the documents.
  for (var i = 0; i < query_remove.length; i++) {
    LocalCollection._removeFromResults(query_remove[i][0], query_remove[i][1]);
  }
};

// XXX atomicity: if multi is true, and one modification fails, do
// we rollback the whole operation, or what?
LocalCollection.prototype.update = function (selector, mod, options) {
  if (!options) options = {};

  var self = this;
  var any = false;
  var selector_f = LocalCollection._compileSelector(selector);
  for (var id in self.docs) {
    var doc = self.docs[id];
    if (selector_f(doc)) {
      self._modifyAndNotify(doc, mod);
      if (!options.multi)
        return;
      any = true;
    }
  }

  if (options.upsert) {
    throw Error("upsert not yet implemented");
  }

  if (options.upsert && !any) {
    // XXX is this actually right? don't we have to resolve/delete
    // $-ops or something like that?
    insert = LocalCollection._deepcopy(selector);
    LocalCollection._modify(insert, mod);
    self.insert(insert);
  }
};

LocalCollection.prototype._modifyAndNotify = function (doc, mod) {
  var self = this;

  var matched_before = {};
  for (var qid in self.queries)
    matched_before[qid] = self.queries[qid].selector_f(doc);

  var old_doc = LocalCollection._deepcopy(doc);

  LocalCollection._modify(doc, mod);

  for (var qid in self.queries) {
    var query = self.queries[qid];
    var before = matched_before[qid];
    var after = query.selector_f(doc);
    if (before && !after)
      LocalCollection._removeFromResults(query, doc);
    else if (!before && after)
      LocalCollection._insertInResults(query, doc);
    else if (before && after)
      LocalCollection._updateInResults(query, doc, old_doc);
  }
};

// XXX findandmodify

LocalCollection._deepcopy = function (v) {
  if (typeof v !== "object")
    return v;
  if (v === null)
    return null; // null has typeof "object"
  if (_.isArray(v)) {
    var ret = v.slice(0);
    for (var i = 0; i < v.length; i++)
      ret[i] = LocalCollection._deepcopy(ret[i]);
    return ret;
  }
  var ret = {};
  for (var key in v)
    ret[key] = LocalCollection._deepcopy(v[key]);
  return ret;
};

// XXX the sorted-query logic below is laughably inefficient. we'll
// need to come up with a better datastructure for this.

LocalCollection._insertInResults = function (query, doc) {
  if (!query.sort_f) {
    query.added(LocalCollection._deepcopy(doc), query.results.length);
    query.results.push(doc);
  } else {
    var i = LocalCollection._insertInSortedList(query.sort_f, query.results, doc);
    query.added(LocalCollection._deepcopy(doc), i);
  }
};

LocalCollection._removeFromResults = function (query, doc) {
  var i = LocalCollection._findInResults(query, doc);
  query.removed(doc, i);
  query.results.splice(i, 1);
};

LocalCollection._updateInResults = function (query, doc, old_doc) {
  var orig_idx = LocalCollection._findInResults(query, doc);
  query.changed(LocalCollection._deepcopy(doc), orig_idx, old_doc);

  if (!query.sort_f)
    return;

  // just take it out and put it back in again, and see if the index
  // changes
  query.results.splice(orig_idx, 1);
  var new_idx = LocalCollection._insertInSortedList(query.sort_f,
                                               query.results, doc);
  if (orig_idx !== new_idx)
    query.moved(LocalCollection._deepcopy(doc), orig_idx, new_idx);
};

LocalCollection._findInResults = function (query, doc) {
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

// At most one snapshot can exist at once. If one already existed,
// overwrite it.
// XXX document (at some point)
// XXX test
// XXX obviously this particular implementation will not be very efficient
LocalCollection.prototype.snapshot = function () {
  this.current_snapshot = {};
  for (var id in this.docs)
    this.current_snapshot[id] = JSON.parse(JSON.stringify(this.docs[id]));
};

// Restore (and destroy) the snapshot. If no snapshot exists, raise an
// exception.
// XXX document (at some point)
// XXX test
LocalCollection.prototype.restore = function () {
  if (!this.current_snapshot)
    throw new Error("No current snapshot");
  this.docs = this.current_snapshot;
  this.current_snapshot = null;

  // Rerun all queries from scratch. (XXX should do something more
  // efficient -- diffing at least; ideally, take the snapshot in an
  // efficient way, say with an undo log, so that we can efficiently
  // tell what changed).
  for (var qid in this.queries) {
    var query = this.queries[qid];

    var old_results = query.results;

    query.results = query.cursor._getRawObjects();

    if (!this.paused)
      LocalCollection._diffQuery(old_results, query.results, query, true);
  }
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

    query.results_snapshot = LocalCollection._deepcopy(query.results);
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
    LocalCollection._diffQuery(query.results_snapshot, query.results, query, true);
    query.results_snapshot = null;
  }

};

