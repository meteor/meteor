import isEmpty from 'lodash.isempty';
import LocalCollection from 'meteor/minimongo/local_collection';

/**
 * @class ObserveWindow
 * The result set of an unordered observe, fed one document at a time.
 *
 * For an unlimited cursor this is every matching document. For a sorted,
 * limited cursor it is the first `limit` matching documents (published) plus a
 * buffer of up to `limit` documents that come next, so a document leaving the
 * published set can usually be replaced without querying MongoDB. When the
 * window can no longer tell what comes next it calls `onNeedRequery`; the
 * driver re-runs the query and hands the result to `_publishNewResults`.
 *
 * Drivers report what they learn about a document through `_handleDoc(id,
 * doc)` (doc is null when it is gone), `_addMatching` and `_removeMatching`.
 * The window reports added/changed/removed to the multiplexer.
 *
 * Options:
 * - multiplexer, matcher, cursorDescription
 * - sorter and limit, for a sorted, limited cursor
 * - projectionFn: the projection published to clients
 * - sharedProjectionFn: the projection kept in memory (adds selector and sort
 *   fields)
 * - onNeedRequery(): the window needs the query re-run. It may throw to unwind
 *   its caller, as OplogObserveDriver does.
 * - isQuerying(): true while the driver is re-running the query
 */
export const ObserveWindow = function (options) {
  const self = this;
  self._multiplexer = options.multiplexer;
  self._matcher = options.matcher;
  self._cursorDescription = options.cursorDescription;
  self._projectionFn = options.projectionFn;
  self._sharedProjectionFn = options.sharedProjectionFn;
  self._onNeedRequery = options.onNeedRequery;
  self._isQuerying = options.isQuerying;

  if (options.limit) {
    // There are several properties ordered driver implements:
    // - _limit is a positive number
    // - _comparator is a function-comparator by which the query is ordered
    // - _unpublishedBuffer is non-null Min/Max Heap,
    //                      the empty buffer in STEADY phase implies that the
    //                      everything that matches the queries selector fits
    //                      into published set.
    // - _published - Max Heap (also implements IdMap methods)

    // We don't support $near and other geo-queries so it's OK to initialize the
    // comparator only once.
    const comparator = options.sorter.getComparator();
    const heapOptions = { IdMap: LocalCollection._IdMap };
    self._limit = options.limit;
    self._comparator = comparator;
    self._unpublishedBuffer = new MinMaxHeap(comparator, heapOptions);
    // We need something that can find Max value in addition to IdMap interface
    self._published = new MaxHeap(comparator, heapOptions);
  } else {
    self._limit = 0;
    self._comparator = null;
    self._unpublishedBuffer = null;
    // Memory Growth
    self._published = new LocalCollection._IdMap;
  }

  // Indicates if it is safe to insert a new document at the end of the buffer
  // for this query. i.e. it is known that there are no documents matching the
  // selector those are not in published or buffer.
  self._safeAppendToBuffer = false;
};

Object.assign(ObserveWindow.prototype, {
  _addPublished: function (id, doc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var fields = Object.assign({}, doc);
      delete fields._id;
      self._published.set(id, self._sharedProjectionFn(doc));
      self._multiplexer.added(id, self._projectionFn(fields));

      // After adding this document, the published set might be overflowed
      // (exceeding capacity specified by limit). If so, push the maximum
      // element to the buffer, we might want to save it in memory to reduce the
      // amount of Mongo lookups in the future.
      if (self._limit && self._published.size() > self._limit) {
        // XXX in theory the size of published is no more than limit+1
        if (self._published.size() !== self._limit + 1) {
          throw new Error("After adding to published, " +
                          (self._published.size() - self._limit) +
                          " documents are overflowing the set");
        }

        var overflowingDocId = self._published.maxElementId();
        var overflowingDoc = self._published.get(overflowingDocId);

        if (EJSON.equals(overflowingDocId, id)) {
          throw new Error("The document just added is overflowing the published set");
        }

        self._published.remove(overflowingDocId);
        self._multiplexer.removed(overflowingDocId);
        self._addBuffered(overflowingDocId, overflowingDoc);
      }
    });
  },
  _removePublished: function (id) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._published.remove(id);
      self._multiplexer.removed(id);
      if (! self._limit || self._published.size() === self._limit)
        return;

      if (self._published.size() > self._limit)
        throw Error("self._published got too big");

      // OK, we are publishing less than the limit. Maybe we should look in the
      // buffer to find the next element past what we were publishing before.

      if (!self._unpublishedBuffer.empty()) {
        // There's something in the buffer; move the first thing in it to
        // _published.
        var newDocId = self._unpublishedBuffer.minElementId();
        var newDoc = self._unpublishedBuffer.get(newDocId);
        self._removeBuffered(newDocId);
        self._addPublished(newDocId, newDoc);
        return;
      }

      // There's nothing in the buffer.  This could mean one of a few things.

      // (a) We could be in the middle of re-running the query (specifically, we
      // could be in _publishNewResults). In that case, _unpublishedBuffer is
      // empty because we clear it at the beginning of _publishNewResults. In
      // this case, our caller already knows the entire answer to the query and
      // we don't need to do anything fancy here.  Just return.
      if (self._isQuerying())
        return;

      // (b) We're pretty confident that the union of _published and
      // _unpublishedBuffer contain all documents that match selector. Because
      // _unpublishedBuffer is empty, that means we're confident that _published
      // contains all documents that match selector. So we have nothing to do.
      if (self._safeAppendToBuffer)
        return;

      // (c) Maybe there are other documents out there that should be in our
      // buffer. But in that case, when we emptied _unpublishedBuffer in
      // _removeBuffered, we should have called onNeedRequery, which will
      // either put something in _unpublishedBuffer or set _safeAppendToBuffer
      // (or both), and it will put us in QUERYING for that whole time. So in
      // fact, we shouldn't be able to get here.

      throw new Error("Buffer inexplicably empty");
    });
  },
  _changePublished: function (id, oldDoc, newDoc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._published.set(id, self._sharedProjectionFn(newDoc));
      var projectedNew = self._projectionFn(newDoc);
      var projectedOld = self._projectionFn(oldDoc);
      var changed = DiffSequence.makeChangedFields(
        projectedNew, projectedOld);
      if (!isEmpty(changed))
        self._multiplexer.changed(id, changed);
    });
  },
  _addBuffered: function (id, doc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._unpublishedBuffer.set(id, self._sharedProjectionFn(doc));

      // If something is overflowing the buffer, we just remove it from cache
      if (self._unpublishedBuffer.size() > self._limit) {
        var maxBufferedId = self._unpublishedBuffer.maxElementId();

        self._unpublishedBuffer.remove(maxBufferedId);

        // Since something matching is removed from cache (both published set and
        // buffer), set flag to false
        self._safeAppendToBuffer = false;
      }
    });
  },
  // Is called either to remove the doc completely from matching set or to move
  // it to the published set later.
  _removeBuffered: function (id) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._unpublishedBuffer.remove(id);
      // To keep the contract "buffer is never empty in STEADY phase unless the
      // everything matching fits into published" true, we poll everything as
      // soon as we see the buffer becoming empty.
      if (! self._unpublishedBuffer.size() && ! self._safeAppendToBuffer)
        self._onNeedRequery();
    });
  },
  // Called when a document has joined the "Matching" results set.
  // Takes responsibility of keeping _unpublishedBuffer in sync with _published
  // and the effect of limit enforced.
  _addMatching: function (doc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var id = doc._id;
      if (self._published.has(id))
        throw Error("tried to add something already published " + id);
      if (self._limit && self._unpublishedBuffer.has(id))
        throw Error("tried to add something already existed in buffer " + id);

      var limit = self._limit;
      var comparator = self._comparator;
      var maxPublished = (limit && self._published.size() > 0) ?
        self._published.get(self._published.maxElementId()) : null;
      var maxBuffered = (limit && self._unpublishedBuffer.size() > 0)
        ? self._unpublishedBuffer.get(self._unpublishedBuffer.maxElementId())
        : null;
      // The query is unlimited or didn't publish enough documents yet or the
      // new document would fit into published set pushing the maximum element
      // out, then we need to publish the doc.
      var toPublish = ! limit || self._published.size() < limit ||
        comparator(doc, maxPublished) < 0;

      // Otherwise we might need to buffer it (only in case of limited query).
      // Buffering is allowed if the buffer is not filled up yet and all
      // matching docs are either in the published set or in the buffer.
      var canAppendToBuffer = !toPublish && self._safeAppendToBuffer &&
        self._unpublishedBuffer.size() < limit;

      // Or if it is small enough to be safely inserted to the middle or the
      // beginning of the buffer.
      var canInsertIntoBuffer = !toPublish && maxBuffered &&
        comparator(doc, maxBuffered) <= 0;

      var toBuffer = canAppendToBuffer || canInsertIntoBuffer;

      if (toPublish) {
        self._addPublished(id, doc);
      } else if (toBuffer) {
        self._addBuffered(id, doc);
      } else {
        // dropping it and not saving to the cache
        self._safeAppendToBuffer = false;
      }
    });
  },
  // Called when a document leaves the "Matching" results set.
  // Takes responsibility of keeping _unpublishedBuffer in sync with _published
  // and the effect of limit enforced.
  _removeMatching: function (id) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      if (! self._published.has(id) && ! self._limit)
        throw Error("tried to remove something matching but not cached " + id);

      if (self._published.has(id)) {
        self._removePublished(id);
      } else if (self._unpublishedBuffer.has(id)) {
        self._removeBuffered(id);
      }
    });
  },
  _handleDoc: function (id, newDoc) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var matchesNow = newDoc && self._matcher.documentMatches(newDoc).result;

      var publishedBefore = self._published.has(id);
      var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);
      var cachedBefore = publishedBefore || bufferedBefore;

      if (matchesNow && !cachedBefore) {
        self._addMatching(newDoc);
      } else if (cachedBefore && !matchesNow) {
        self._removeMatching(id);
      } else if (cachedBefore && matchesNow) {
        var oldDoc = self._published.get(id);
        var comparator = self._comparator;
        var minBuffered = self._limit && self._unpublishedBuffer.size() &&
          self._unpublishedBuffer.get(self._unpublishedBuffer.minElementId());
        var maxBuffered;

        if (publishedBefore) {
          // Unlimited case where the document stays in published once it
          // matches or the case when we don't have enough matching docs to
          // publish or the changed but matching doc will stay in published
          // anyways.
          //
          // XXX: We rely on the emptiness of buffer. Be sure to maintain the
          // fact that buffer can't be empty if there are matching documents not
          // published. Notably, we don't want to schedule repoll and continue
          // relying on this property.
          var staysInPublished = ! self._limit ||
            self._unpublishedBuffer.size() === 0 ||
            comparator(newDoc, minBuffered) <= 0;

          if (staysInPublished) {
            self._changePublished(id, oldDoc, newDoc);
          } else {
            // after the change doc doesn't stay in the published, remove it
            self._removePublished(id);
            // but it can move into buffered now, check it
            maxBuffered = self._unpublishedBuffer.get(
              self._unpublishedBuffer.maxElementId());

            var toBuffer = self._safeAppendToBuffer ||
                  (maxBuffered && comparator(newDoc, maxBuffered) <= 0);

            if (toBuffer) {
              self._addBuffered(id, newDoc);
            } else {
              // Throw away from both published set and buffer
              self._safeAppendToBuffer = false;
            }
          }
        } else if (bufferedBefore) {
          oldDoc = self._unpublishedBuffer.get(id);
          // remove the old version manually instead of using _removeBuffered so
          // we don't trigger the querying immediately.  if we end this block
          // with the buffer empty, we will need to trigger the query poll
          // manually too.
          self._unpublishedBuffer.remove(id);

          var maxPublished = self._published.get(
            self._published.maxElementId());
          maxBuffered = self._unpublishedBuffer.size() &&
                self._unpublishedBuffer.get(
                  self._unpublishedBuffer.maxElementId());

          // the buffered doc was updated, it could move to published
          var toPublish = comparator(newDoc, maxPublished) < 0;

          // or stays in buffer even after the change
          var staysInBuffer = (! toPublish && self._safeAppendToBuffer) ||
                (!toPublish && maxBuffered &&
                 comparator(newDoc, maxBuffered) <= 0);

          if (toPublish) {
            self._addPublished(id, newDoc);
          } else if (staysInBuffer) {
            // stays in buffer but changes
            self._unpublishedBuffer.set(id, newDoc);
          } else {
            // Throw away from both published set and buffer
            self._safeAppendToBuffer = false;
            // Normally this check would have been done in _removeBuffered but
            // we didn't use it, so we need to do it ourself now.
            if (! self._unpublishedBuffer.size()) {
              self._onNeedRequery();
            }
          }
        } else {
          throw new Error("cachedBefore implies either of publishedBefore or bufferedBefore is true.");
        }
      }
    });
  },

  // Replace self._published with newResults (both are IdMaps), invoking observe
  // callbacks on the multiplexer.
  // Replace self._unpublishedBuffer with newBuffer.
  //
  // XXX This is very similar to LocalCollection._diffQueryUnorderedChanges. We
  // should really: (a) Unify IdMap and OrderedDict into Unordered/OrderedDict
  // (b) Rewrite diff.js to use these classes instead of arrays and objects.
  _publishNewResults: function (newResults, newBuffer) {
    var self = this;
    Meteor._noYieldsAllowed(function () {

      // If the query is limited and there is a buffer, shut down so it doesn't
      // stay in a way.
      if (self._limit) {
        self._unpublishedBuffer.clear();
      }

      // First remove anything that's gone. Be careful not to modify
      // self._published while iterating over it.
      var idsToRemove = [];
      self._published.forEach(function (doc, id) {
        if (!newResults.has(id))
          idsToRemove.push(id);
      });
      idsToRemove.forEach(function (id) {
        self._removePublished(id);
      });

      // Now do adds and changes.
      // If self has a buffer and limit, the new fetched result will be
      // limited correctly as the query has sort specifier.
      newResults.forEach(function (doc, id) {
        self._handleDoc(id, doc);
      });

      // Sanity-check that everything we tried to put into _published ended up
      // there.
      // XXX if this is slow, remove it later
      if (self._published.size() !== newResults.size()) {
        Meteor._debug('The Mongo server and the Meteor query disagree on how ' +
          'many documents match your query. Cursor description: ',
          self._cursorDescription);
      }
      
      self._published.forEach(function (doc, id) {
        if (!newResults.has(id))
          throw Error("_published has a doc that newResults doesn't; " + id);
      });

      // Finally, replace the buffer
      newBuffer.forEach(function (doc, id) {
        self._addBuffered(id, doc);
      });

      self._safeAppendToBuffer = newBuffer.size() < self._limit;
    });
  }
});
