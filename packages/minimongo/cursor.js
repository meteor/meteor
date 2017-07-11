import {LocalCollection} from './local_collection.js';

// Cursor: a specification for a particular subset of documents, w/
// a defined order, limit, and offset.  creating a Cursor with LocalCollection.find(),
export class Cursor {
  // don't call this ctor directly.  use LocalCollection.find().
  constructor (collection, selector, options) {
    const self = this;
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
  }

  /**
   * @summary Returns the number of documents that match a query.
   * @memberOf Mongo.Cursor
   * @method  count
   * @instance
   * @locus Anywhere
   * @returns {Number}
   */
  count () {
    const self = this;

    if (self.reactive)
      self._depend({added: true, removed: true},
                   true /* allow the observe to be unordered */);

    return self._getRawObjects({ordered: true}).length;
  }

  /**
   * @summary Return all matching documents as an Array.
   * @memberOf Mongo.Cursor
   * @method  fetch
   * @instance
   * @locus Anywhere
   * @returns {Object[]}
   */
  fetch () {
    const self = this;
    const res = [];
    self.forEach(doc => {
      res.push(doc);
    });
    return res;
  }

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
  forEach (callback, thisArg) {
    const self = this;

    const objects = self._getRawObjects({ordered: true});

    if (self.reactive) {
      self._depend({
        addedBefore: true,
        removed: true,
        changed: true,
        movedBefore: true});
    }

    objects.forEach((elt, i) => {
      // This doubles as a clone operation.
      elt = self._projectionFn(elt);

      if (self._transform)
        elt = self._transform(elt);
      callback.call(thisArg, elt, i, self);
    });
  }

  getTransform () {
    return this._transform;
  }

  /**
   * @summary Map callback over all matching documents.  Returns an Array.
   * @locus Anywhere
   * @method map
   * @instance
   * @memberOf Mongo.Cursor
   * @param {IterationCallback} callback Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself.
   * @param {Any} [thisArg] An object which will be the value of `this` inside `callback`.
   */
  map (callback, thisArg) {
    const self = this;
    const res = [];
    self.forEach((doc, index) => {
      res.push(callback.call(thisArg, doc, index, self));
    });
    return res;
  }

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
  observe (options) {
    const self = this;
    return LocalCollection._observeFromObserveChanges(self, options);
  }

  /**
   * @summary Watch a query.  Receive callbacks as the result set changes.  Only the differences between the old and new documents are passed to the callbacks.
   * @locus Anywhere
   * @memberOf Mongo.Cursor
   * @instance
   * @param {Object} callbacks Functions to call to deliver the result set as it changes
   */
  observeChanges (options) {
    const self = this;

    const ordered = LocalCollection._observeChangesCallbacksAreOrdered(options);

    // there are several places that assume you aren't combining skip/limit with
    // unordered observe.  eg, update's EJSON.clone, and the "there are several"
    // comment in _modifyAndNotify
    // XXX allow skip/limit with unordered observe
    if (!options._allow_unordered && !ordered && (self.skip || self.limit))
      throw new Error("must use ordered observe (ie, 'addedBefore' instead of 'added') with skip or limit");

    if (self.fields && (self.fields._id === 0 || self.fields._id === false))
      throw Error("You may not observe a cursor with {fields: {_id: 0}}");

    const query = {
      dirty: false,
      matcher: self.matcher, // not fast pathed
      sorter: ordered && self.sorter,
      distances: (
        self.matcher.hasGeoQuery() && ordered && new LocalCollection._IdMap),
      resultsSnapshot: null,
      ordered,
      cursor: self,
      projectionFn: self._projectionFn
    };
    let qid;

    // Non-reactive queries call added[Before] and then never call anything
    // else.
    if (self.reactive) {
      qid = self.collection.next_qid++;
      self.collection.queries[qid] = query;
    }
    query.results = self._getRawObjects({
      ordered, distances: query.distances});
    if (self.collection.paused)
      query.resultsSnapshot = (ordered ? [] : new LocalCollection._IdMap);

    // wrap callbacks we were passed. callbacks only fire when not paused and
    // are never undefined
    // Filters out blacklisted fields according to cursor's projection.
    // XXX wrong place for this?

    // furthermore, callbacks enqueue until the operation we're working on is
    // done.
    const wrapCallback = f => {
      if (!f)
        return () => {};
      return function (/*args*/) {
        const context = this;
        const args = arguments;

        if (self.collection.paused)
          return;

        self.collection._observeQueue.queueTask(() => {
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
      const results = query.results._map || query.results;
      Object.keys(results).forEach(key => {
        const doc = results[key];
        const fields = EJSON.clone(doc);

        delete fields._id;
        if (ordered)
          query.addedBefore(doc._id, self._projectionFn(fields), null);
        query.added(doc._id, self._projectionFn(fields));
      });
    }

    const handle = new LocalCollection.ObserveHandle;
    Object.assign(handle, {
      collection: self.collection,
      stop() {
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
      Tracker.onInvalidate(() => {
        handle.stop();
      });
    }
    // run the observe callbacks resulting from the initial contents
    // before we leave the observe.
    self.collection._observeQueue.drain();

    return handle;
  }

  // Since we don't actually have a "nextObject" interface, there's really no
  // reason to have a "rewind" interface.  All it did was make multiple calls
  // to fetch/map/forEach return nothing the second time.
  // XXX COMPAT WITH 0.8.1
  rewind () {}

  // XXX Maybe we need a version of observe that just calls a callback if
  // anything changed.
  _depend (changers, _allow_unordered) {
    const self = this;

    if (Tracker.active) {
      const v = new Tracker.Dependency;
      v.depend();
      const notifyChange = v.changed.bind(v);

      const options = {
        _suppress_initial: true,
        _allow_unordered
      };
      ['added', 'changed', 'removed', 'addedBefore', 'movedBefore'].forEach(fnName => {
        if (changers[fnName])
          options[fnName] = notifyChange;
      });

      // observeChanges will stop() when this computation is invalidated
      self.observeChanges(options);
    }
  }

  _getCollectionName () {
    const self = this;
    return self.collection.name;
  }

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
  _getRawObjects (options) {
    const self = this;
    options = options || {};

    // XXX use OrderedDict instead of array, and make IdMap and OrderedDict
    // compatible
    const results = options.ordered ? [] : new LocalCollection._IdMap;

    // fast path for single ID value
    if (self._selectorId !== undefined) {
      // If you have non-zero skip and ask for a single id, you get
      // nothing. This is so it matches the behavior of the '{_id: foo}'
      // path.
      if (self.skip)
        return results;

      const selectedDoc = self.collection._docs.get(self._selectorId);
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
    let distances;
    if (self.matcher.hasGeoQuery() && options.ordered) {
      if (options.distances) {
        distances = options.distances;
        distances.clear();
      } else {
        distances = new LocalCollection._IdMap();
      }
    }

    self.collection._docs.forEach((doc, id) => {
      const matchResult = self.matcher.documentMatches(doc);
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
      const comparator = self.sorter.getComparator({distances});
      results.sort(comparator);
    }

    const idx_start = self.skip || 0;
    const idx_end = self.limit ? (self.limit + idx_start) : results.length;
    return results.slice(idx_start, idx_end);
  }

  _publishCursor (sub) {
    const self = this;
    if (! self.collection.name)
      throw new Error("Can't publish a cursor from a collection without a name.");
    const collection = self.collection.name;

    // XXX minimongo should not depend on mongo-livedata!
    if (! Package.mongo) {
      throw new Error("Can't publish from Minimongo without the `mongo` package.");
    }

    return Package.mongo.Mongo.Collection._publishCursor(self, sub, collection);
  }
}
