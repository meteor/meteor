// XXX indexes
// XXX type checking on selectors (graceful error if malformed)

Collection = function () {
  this.docs = {}; // _id -> document (also containing id)

  this.next_qid = 1; // query id generator

  // qid -> query object. keys: selector_f, sort_f, (callbacks)
  this.queries = {};
};

  // XXX enforce rule that field names can't start with '$' or contain '.'
  // (real mongodb does in fact enforce this)
  // XXX possibly enforce that 'undefined' does not appear (we assume
  // this in our handling of null and $exists)
Collection.prototype.insert = function (doc) {
  var self = this;
  doc = Collection._deepcopy(doc);
  // XXX deal with mongo's binary id type?
  if (!('_id' in doc))
    doc._id = Collection.uuid();
  // XXX check to see that there is no object with this _id yet?
  self.docs[doc._id] = doc;
  for (var qid in self.queries) {
    var query = self.queries[qid];
    if (query.selector_f(doc))
      Collection._insertInResults(query, doc);
  }
};

// XXX add one more sort form: "key"
// and tests, etc

// options may include sort, skip, limit, reactive
// sort may be any of these forms:
//     {a: 1, b: -1}
//     [["a", "asc"], ["b", "desc"]]
//     ["a", ["b", "desc"]]
//   (in the first form you're beholden to key enumeration order in
//   your javascript VM)
//
// reactive: if given, and false, don't register with Sky.deps (default
// is true)
//
// XXX possibly should support retrieving a subset of fields? and
// have it be a hint (ignored on the client, when not copying the
// doc?)
//
// XXX sort does not yet support subkeys ('a.b') .. fix that!
Collection.prototype.find = function (selector, options) {
  var self = this;
  options = options || {};

  var results = null;

  if (typeof selector === 'string') {
    // XXX fast path for single object. NOTE: this is actually a
    // different return type than {_id: id} (either object or null, not
    // array). Maybe rename this findOne to match mongo?
    results = self.docs[selector] || null;
    results = Collection._deepcopy(results);
  } else {

    var selector_f = Collection._compileSelector(selector);
    var sort_f = options.sort && Collection._compileSort(options.sort);
    results = self._rawFind(selector_f, sort_f);

    if (options.skip)
      results.splice(0, options.skip);
    if (options.limit !== undefined) {
      var limit = options.limit;
      if (results.length > limit)
        results.length = limit;
    }
    for (var i = 0; i < results.length; i++)
      results[i] = Collection._deepcopy(results[i]);

  }

  // support Sky.deps if present
  var reactive = (options.reactive === undefined) ? true : options.reactive;
  var context = reactive && typeof Sky === "object" && Sky.deps &&
    Sky.deps.Context.current;
  if (context) {
    var invalidate = _.bind(context.invalidate, context);

    var new_options = _.clone(options);
    _.extend(new_options, {
      added: invalidate,
      removed: invalidate,
      changed: invalidate,
      moved: invalidate,
      _suppress_initial: true,
    });

    var live_handle = self.findLive(selector, new_options);
    context.on_invalidate(function () {
      // XXX in many cases, the query will be immediately
      // recreated. so we might want to let it linger for a little
      // while and repurpose it if it comes back. this will save us
      // work because we won't have to redo the initial find.
      live_handle.stop();
    });
  }

  return results;
};

// options to contain:
//  * callbacks:
//    - added (object, before_index)
//    - changed (new_object, at_index)
//    - moved (object, old_index, new_index) - can only fire with changed()
//    - removed (id, at_index)
//  * sort: sort descriptor
//
// attributes available on returned query handle:
//  * stop(): end updates
//  * indexOf(id): return current index of object in result set, or -1
//  * reconnect({}): replace added, changed, moved, removed, from the
//      arguments, and call added to deliver the current state of the
//      query (XXX ugly hack to support templating)
//  * collection: the collection this query is querying
//
// iff x is a returned query handle, (x instanceof
// Collection.LiveResultsSet) is true
//
// initial results delivered through added callback
// XXX maybe callbacks should take a list of objects, to expose transactions?
// XXX maybe support field limiting (to limit what you're notified on)
// XXX maybe support limit/skip
// XXX it'd be helpful if removed got the object that just left the
// query, not just its id
// XXX document that initial results will definitely be delivered before we return [do, add to asana]

Collection.LiveResultsSet = function () {};
Collection.prototype.findLive = function (selector, options) {
  var self = this;
  var qid = self.next_qid++;
  if (typeof(selector) === "string")
    selector = {_id: selector};

  var query = self.queries[qid] = {
    selector_f: Collection._compileSelector(selector),
    sort_f: options.sort ? Collection._compileSort(options.sort) : null,
    results: []
  };
  query.results = self._rawFind(query.selector_f, query.sort_f);

  var connect = function (options) {
    query.added = options.added || function () {};
    query.changed = options.changed || function () {};
    query.moved = options.moved || function () {};
    query.removed = options.removed || function () {};
    if (!options._suppress_initial)
      for (var i = 0; i < query.results.length; i++)
        query.added(Collection._deepcopy(query.results[i]), i);
  };

  connect(options);

  var handle = new Collection.LiveResultsSet;
  _.extend(handle, {
    stop: function () {
      delete self.queries[qid];
    },
    indexOf: function (id) {
      for (var i = 0; i < query.results.length; i++)
        if (query.results[i]._id === id)
          return i;
      return -1;
    },
    reconnect: connect,
    collection: this
  });
  return handle;
};

// returns matching objects, but doesn't copy them
// if sort_f is falsey, no sort -- you get the natural order
Collection.prototype._rawFind = function (selector_f, sort_f) {
  var self = this;
  var results = [];
  for (var id in self.docs) {
    var doc = self.docs[id];
    if (selector_f(doc))
      results.push(doc);
  }
  if (sort_f)
    results.sort(sort_f);
  return results;
};

Collection.prototype.remove = function (selector) {
  var self = this;
  var remove = [];
  var query_remove = [];
  if (typeof(selector) === "string")
    selector = {_id: selector};
  var selector_f = Collection._compileSelector(selector);
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

  // run findLive callbacks _after_ we've removed the documents.
  for (var i = 0; i < query_remove.length; i++) {
    Collection._removeFromResults(query_remove[i][0], query_remove[i][1]);
  }
};

// XXX atomicity: if multi is true, and one modification fails, do
// we rollback the whole operation, or what?
Collection.prototype.update = function (selector, mod, options) {
  if (typeof(selector) === "string")
    selector = {_id: selector};

  if (!options) options = {};
  // Default to multi. This is the oppposite of mongo. We'll see how it goes.
  if (typeof(options.multi) === "undefined")
    options.multi = true

  var self = this;
  var any = false;
  var selector_f = Collection._compileSelector(selector);
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
    insert = Collection._deepcopy(selector);
    Collection._modify(insert, mod);
    self.insert(insert);
  }
};

Collection.prototype._modifyAndNotify = function (doc, mod) {
  var self = this;

  var matched_before = {};
  for (var qid in self.queries)
    matched_before[qid] = self.queries[qid].selector_f(doc);

  Collection._modify(doc, mod);

  for (var qid in self.queries) {
    var query = self.queries[qid];
    var before = matched_before[qid];
    var after = query.selector_f(doc);
    if (before && !after)
      Collection._removeFromResults(query, doc);
    else if (!before && after)
      Collection._insertInResults(query, doc);
    else if (before && after)
      Collection._updateInResults(query, doc);
  }
};

// XXX findandmodify

Collection._deepcopy = function (v) {
  if (typeof(v) !== "object")
    return v;
  if (v === null)
    return null; // null has typeof "object"
  if (v instanceof Array) {
    var ret = [];
    for (var i = 0; i < v.length; i++)
      ret.push(Collection._deepcopy(v[i]));
    return ret;
  }
  var ret = {};
  for (key in v)
    ret[key] = Collection._deepcopy(v[key]);
  return ret;
};

// XXX the sorted-query logic below is laughably inefficient. we'll
// need to come up with a better datastructure for this.

Collection._insertInResults = function (query, doc) {
  if (!query.sort_f) {
    query.added(doc, query.results.length);
    query.results.push(doc);
  } else {
    var i = Collection._insertInSortedList(query.sort_f, query.results, doc);
    query.added(doc, i);
  }
};

Collection._removeFromResults = function (query, doc) {
  var i = Collection._findInResults(query, doc);
  query.removed(doc._id, i);
  query.results.splice(i, 1);
};

Collection._updateInResults = function (query, doc) {
  var orig_idx = Collection._findInResults(query, doc);
  query.changed(Collection._deepcopy(doc), orig_idx);

  if (!query.sort_f)
    return;

  // just take it out and put it back in again, and see if the index
  // changes
  query.results.splice(orig_idx, 1);
  var new_idx = Collection._insertInSortedList(query.sort_f,
                                               query.results, doc);
  if (orig_idx !== new_idx)
    query.moved(doc, orig_idx, new_idx);
};

Collection._findInResults = function (query, doc) {
  for (var i = 0; i < query.results.length; i++)
    if (query.results[i] === doc)
      return i;
  throw Error("object missing from query");
};

Collection._insertInSortedList = function (cmp, array, value) {
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
