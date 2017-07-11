import {Cursor} from './cursor.js';
import {ObserveHandle} from './observe_handle.js';

export class LocalCollection {
  static Cursor = Cursor;

  static ObserveHandle = ObserveHandle;

  // XXX maybe move these into another ObserveHelpers package or something

  // _CachingChangeObserver is an object which receives observeChanges callbacks
  // and keeps a cache of the current cursor state up to date in self.docs. Users
  // of this class should read the docs field but not modify it. You should pass
  // the "applyChange" field as the callbacks to the underlying observeChanges
  // call. Optionally, you can specify your own observeChanges callbacks which are
  // invoked immediately before the docs field is updated; this object is made
  // available as `this` to those callbacks.
  static _CachingChangeObserver = class _CachingChangeObserver {
    constructor (options) {
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
    }
  };

  static _IdMap = class _IdMap extends IdMap {
    constructor () {
      super(MongoID.idStringify, MongoID.idParse);
    }
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
  static wrapTransform = transform => {
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

      if (!LocalCollection._isPlainObject(transformed)) {
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

  // XXX the sorted-query logic below is laughably inefficient. we'll
  // need to come up with a better datastructure for this.
  //
  // XXX the logic for observing with a skip or a limit is even more
  // laughably inefficient. we recompute the whole results every time!

  // This binary search puts a value between any equal values, and the first
  // lesser value.
  static _binarySearch = (cmp, array, value) => {
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

  static _checkSupportedProjection = fields => {
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

  // Knows how to compile a fields projection to a predicate function.
  // @returns - Function: a closure that filters out an object according to the
  //            fields projection rules:
  //            @param obj - Object: MongoDB-styled document
  //            @returns - Object: a document with the fields filtered out
  //                       according to projection rules. Doesn't retain subfields
  //                       of passed argument.
  static _compileProjection = fields => {
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

  static _diffObjects = (left, right, callbacks) => {
    return DiffSequence.diffObjects(left, right, callbacks);
  };

  // ordered: bool.
  // old_results and new_results: collections of documents.
  //    if ordered, they are arrays.
  //    if unordered, they are IdMaps
  static _diffQueryChanges = (ordered, oldResults, newResults, observer, options) => {
    return DiffSequence.diffQueryChanges(ordered, oldResults, newResults, observer, options);
  };

  static _diffQueryOrderedChanges = (oldResults, newResults, observer, options) => {
    return DiffSequence.diffQueryOrderedChanges(oldResults, newResults, observer, options);
  };

  static _diffQueryUnorderedChanges = (oldResults, newResults, observer, options) => {
    return DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, observer, options);
  };

  static _findInOrderedResults = (query, doc) => {
    if (!query.ordered)
      throw new Error("Can't call _findInOrderedResults on unordered query");
    for (var i = 0; i < query.results.length; i++)
      if (query.results[i] === doc)
        return i;
    throw Error("object missing from query");
  };

  // If this is a selector which explicitly constrains the match by ID to a finite
  // number of documents, returns a list of their IDs.  Otherwise returns
  // null. Note that the selector may have other restrictions so it may not even
  // match those document!  We care about $in and $and since those are generated
  // access-controlled update and remove.
  static _idsMatchedBySelector = selector => {
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

  static _insertInResults = (query, doc) => {
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

  static _insertInSortedList = (cmp, array, value) => {
    if (array.length === 0) {
      array.push(value);
      return 0;
    }

    var idx = LocalCollection._binarySearch(cmp, array, value);
    array.splice(idx, 0, value);
    return idx;
  };

  // XXX maybe this should be EJSON.isObject, though EJSON doesn't know about
  // RegExp
  // XXX note that _type(undefined) === 3!!!!
  static _isPlainObject = x => {
    return x && LocalCollection._f._type(x) === 3;
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
  static _modify = (doc, mod, options) => {
    options = options || {};
    if (!LocalCollection._isPlainObject(mod))
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

  static _observeFromObserveChanges = (cursor, observeCallbacks) => {
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

  static _observeCallbacksAreOrdered = callbacks => {
    if (callbacks.addedAt && callbacks.added)
      throw new Error("Please specify only one of added() and addedAt()");
    if (callbacks.changedAt && callbacks.changed)
      throw new Error("Please specify only one of changed() and changedAt()");
    if (callbacks.removed && callbacks.removedAt)
      throw new Error("Please specify only one of removed() and removedAt()");

    return !!(callbacks.addedAt || callbacks.movedTo || callbacks.changedAt
              || callbacks.removedAt);
  };

  static _observeChangesCallbacksAreOrdered = callbacks => {
    if (callbacks.added && callbacks.addedBefore)
      throw new Error("Please specify only one of added() and addedBefore()");
    return !!(callbacks.addedBefore || callbacks.movedBefore);
  };

  // When performing an upsert, the incoming selector object can be re-used as
  // the upsert modifier object, as long as Mongo query and projection
  // operators (prefixed with a $ character) are removed from the newly
  // created modifier object. This function attempts to strip all $ based Mongo
  // operators when creating the upsert modifier object.
  // NOTE: There is a known issue here in that some Mongo $ based opeartors
  // should not actually be stripped.
  // See https://github.com/meteor/meteor/issues/8806.
  static _removeDollarOperators = selector => {
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

  static _removeFromResults = (query, doc) => {
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

  // Is this selector just shorthand for lookup by _id?
  static _selectorIsId = selector => {
    return (typeof selector === "string") ||
      (typeof selector === "number") ||
      selector instanceof MongoID.ObjectID;
  };

  // Is the selector just lookup by _id (shorthand or not)?
  static _selectorIsIdPerhapsAsObject = selector => {
    return LocalCollection._selectorIsId(selector) ||
      (selector && typeof selector === "object" &&
       selector._id && LocalCollection._selectorIsId(selector._id) &&
       Object.keys(selector).length === 1);
  };

  static _updateInResults = (query, doc, old_doc) => {
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

  constructor (name) {
    this.name = name;
    // _id -> document (also containing id)
    this._docs = new LocalCollection._IdMap;

    this._observeQueue = new Meteor._SynchronousQueue();

    this.next_qid = 1; // live query id generator

    // qid -> live query object. keys:
    //  ordered: bool. ordered queries have addedBefore/movedBefore callbacks.
    //  results: array (ordered) or object (unordered) of current results
    //    (aliased with this._docs!)
    //  resultsSnapshot: snapshot of results. null if not paused.
    //  cursor: Cursor object for the query.
    //  selector, sorter, (callbacks): functions
    this.queries = {};

    // null if not saving originals; an IdMap from id to original document value if
    // saving originals. See comments before saveOriginals().
    this._savedOriginals = null;

    // True when observers are paused and we should not send callbacks.
    this.paused = false;
  }

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
  find (selector, options) {
    // default syntax for everything is to omit the selector argument.
    // but if selector is explicitly passed in as false or undefined, we
    // want a selector that matches nothing.
    if (arguments.length === 0)
      selector = {};

    return new LocalCollection.Cursor(this, selector, options);
  }

  findOne (selector, options) {
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
  }

  // XXX possibly enforce that 'undefined' does not appear (we assume
  // this in our handling of null and $exists)
  insert (doc, callback) {
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
  }

  // Pause the observers. No callbacks from observers will fire until
  // 'resumeObservers' is called.
  pauseObservers () {
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
  }

  remove (selector, callback) {
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
  }

  // Resume the observers. Observers immediately receive change
  // notifications to bring them to the current state of the
  // database. Note that this is not just replaying all the changes that
  // happened during the pause, it is a smarter 'coalesced' diff.
  resumeObservers () {
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
  }

  retrieveOriginals () {
    var self = this;
    if (!self._savedOriginals)
      throw new Error("Called retrieveOriginals without saveOriginals");

    var originals = self._savedOriginals;
    self._savedOriginals = null;
    return originals;
  }

  // To track what documents are affected by a piece of code, call saveOriginals()
  // before it and retrieveOriginals() after it. retrieveOriginals returns an
  // object whose keys are the ids of the documents that were affected since the
  // call to saveOriginals(), and the values are equal to the document's contents
  // at the time of saveOriginals. (In the case of an inserted document, undefined
  // is the value.) You must alternate between calls to saveOriginals() and
  // retrieveOriginals().
  saveOriginals () {
    var self = this;
    if (self._savedOriginals)
      throw new Error("Called saveOriginals twice without retrieveOriginals");
    self._savedOriginals = new LocalCollection._IdMap;
  }

  // XXX atomicity: if multi is true, and one modification fails, do
  // we rollback the whole operation, or what?
  update (selector, mod, options, callback) {
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
  }

  // A convenience wrapper on update. LocalCollection.upsert(sel, mod) is
  // equivalent to LocalCollection.update(sel, mod, { upsert: true, _returnObject:
  // true }).
  upsert (selector, mod, options, callback) {
    var self = this;
    if (! callback && typeof options === "function") {
      callback = options;
      options = {};
    }
    return self.update(selector, mod, Object.assign({}, options, {
      upsert: true,
      _returnObject: true
    }), callback);
  }

  // Iterates over a subset of documents that could match selector; calls
  // f(doc, id) on each of them.  Specifically, if selector specifies
  // specific _id's, it only looks at those.  doc is *not* cloned: it is the
  // same object that is in _docs.
  _eachPossiblyMatchingDoc (selector, f) {
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
  }

  _modifyAndNotify (doc, mod, recomputeQids, arrayIndices) {
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
  }

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
  _recomputeResults (query, oldResults) {
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
  }

  _saveOriginal (id, doc) {
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
  }
}

const MODIFIERS = {
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

const NO_CREATE_MODIFIERS = {
  $unset: true,
  $pop: true,
  $rename: true,
  $pull: true,
  $pullAll: true
};

// Make sure field names do not contain Mongo restricted
// characters ('.', '$', '\0').
// https://docs.mongodb.com/manual/reference/limits/#Restrictions-on-Field-Names
const invalidCharMsg = {
  '.': "contain '.'",
  '$': "start with '$'",
  '\0': "contain null bytes",
};

// checks if all field names in an object are valid
function assertHasValidFieldNames (doc){
  if (doc && typeof doc === "object") {
    JSON.stringify(doc, (key, value) => {
      assertIsValidFieldName(key);
      return value;
    });
  }
}

function assertIsValidFieldName (key) {
  let match;
  if (typeof key === 'string' && (match = key.match(/^\$|\.|\0/))) {
    throw MinimongoError(`Key ${key} must not ${invalidCharMsg[match[0]]}`);
  }
}

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
function findModTarget (doc, keyparts, options) {
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
}

function objectOnlyHasDollarKeys (object) {
  const keys = Object.keys(object);
  return keys.length > 0 && keys.every(key => key.charAt(0) === '$');
}

// paths - Array: list of mongo style paths
// newLeafFn - Function: of form function(path) should return a scalar value to
//                       put into list created for that path
// conflictFn - Function: of form function(node, path, fullPath) is called
//                        when building a tree path for 'fullPath' node on
//                        'path' was already a leaf with a value. Must return a
//                        conflict resolution.
// initial tree - Optional Object: starting tree.
// @returns - Object: tree represented as a set of nested objects
function pathsToTree (paths, newLeafFn, conflictFn, tree) {
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
}

// Traverses the keys of passed projection and constructs a tree where all
// leaves are either all True or all False
// @returns Object:
//  - tree - Object - tree representation of keys involved in projection
//  (exception for '_id' as it is a special case handled separately)
//  - including - Boolean - "take only certain fields" type of projection
function projectionDetails (fields) {
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
}
