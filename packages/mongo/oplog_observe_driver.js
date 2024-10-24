import has from 'lodash.has';
import isEmpty from 'lodash.isempty';
import { oplogV2V1Converter } from "./oplog_v2_converter";
import { check, Match } from 'meteor/check';

var PHASE = {
  QUERYING: "QUERYING",
  FETCHING: "FETCHING",
  STEADY: "STEADY"
};

// Exception thrown by _needToPollQuery which unrolls the stack up to the
// enclosing call to finishIfNeedToPollQuery.
var SwitchedToQuery = function () {};
var finishIfNeedToPollQuery = function (f) {
  return function () {
    try {
      f.apply(this, arguments);
    } catch (e) {
      if (!(e instanceof SwitchedToQuery))
        throw e;
    }
  };
};

var currentId = 0;

// OplogObserveDriver is an alternative to PollingObserveDriver which follows
// the Mongo operation log instead of just re-polling the query. It obeys the
// same simple interface: constructing it starts sending observeChanges
// callbacks (and a ready() invocation) to the ObserveMultiplexer, and you stop
// it by calling the stop() method.
OplogObserveDriver = function (options) {
  const self = this;
  self._usesOplog = true;  // tests look at this

  self._id = currentId;
  currentId++;

  self._cursorDescription = options.cursorDescription;
  self._mongoHandle = options.mongoHandle;
  self._multiplexer = options.multiplexer;

  if (options.ordered) {
    throw Error("OplogObserveDriver only supports unordered observeChanges");
  }

  const sorter = options.sorter;
  // We don't support $near and other geo-queries so it's OK to initialize the
  // comparator only once in the constructor.
  const comparator = sorter && sorter.getComparator();

  if (options.cursorDescription.options.limit) {
    // There are several properties ordered driver implements:
    // - _limit is a positive number
    // - _comparator is a function-comparator by which the query is ordered
    // - _unpublishedBuffer is non-null Min/Max Heap,
    //                      the empty buffer in STEADY phase implies that the
    //                      everything that matches the queries selector fits
    //                      into published set.
    // - _published - Max Heap (also implements IdMap methods)

    const heapOptions = { IdMap: LocalCollection._IdMap };
    self._limit = self._cursorDescription.options.limit;
    self._comparator = comparator;
    self._sorter = sorter;
    self._unpublishedBuffer = new MinMaxHeap(comparator, heapOptions);
    // We need something that can find Max value in addition to IdMap interface
    self._published = new MaxHeap(comparator, heapOptions);
  } else {
    self._limit = 0;
    self._comparator = null;
    self._sorter = null;
    self._unpublishedBuffer = null;
    self._published = new LocalCollection._IdMap;
  }

  // Indicates if it is safe to insert a new document at the end of the buffer
  // for this query. i.e. it is known that there are no documents matching the
  // selector those are not in published or buffer.
  self._safeAppendToBuffer = false;

  self._stopped = false;
  self._stopHandles = [];
  self._addStopHandles = function (newStopHandles) {
    const expectedPattern = Match.ObjectIncluding({ stop: Function });
    // Single item or array
    check(newStopHandles, Match.OneOf([expectedPattern], expectedPattern));
    self._stopHandles.push(newStopHandles);
  }

  Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
    "mongo-livedata", "observe-drivers-oplog", 1);

  self._registerPhaseChange(PHASE.QUERYING);

  self._matcher = options.matcher;
  // we are now using projection, not fields in the cursor description even if you pass {fields}
  // in the cursor construction
  const projection = self._cursorDescription.options.fields || self._cursorDescription.options.projection || {};
  self._projectionFn = LocalCollection._compileProjection(projection);
  // Projection function, result of combining important fields for selector and
  // existing fields projection
  self._sharedProjection = self._matcher.combineIntoProjection(projection);
  if (sorter)
    self._sharedProjection = sorter.combineIntoProjection(self._sharedProjection);
  self._sharedProjectionFn = LocalCollection._compileProjection(
    self._sharedProjection);

  self._needToFetch = new LocalCollection._IdMap;
  self._currentlyFetching = null;
  self._fetchGeneration = 0;

  self._requeryWhenDoneThisQuery = false;
  self._writesToCommitWhenWeReachSteady = [];



 };

Object.assign(OplogObserveDriver.prototype, {
  _init: async function() {
    const self = this;

    // If the oplog handle tells us that it skipped some entries (because it got
    // behind, say), re-poll.
    self._addStopHandles(self._mongoHandle._oplogHandle.onSkippedEntries(
      finishIfNeedToPollQuery(function () {
        return self._needToPollQuery();
      })
    ));
    
    await forEachTrigger(self._cursorDescription, async function (trigger) {
      self._addStopHandles(await self._mongoHandle._oplogHandle.onOplogEntry(
        trigger, function (notification) {
          finishIfNeedToPollQuery(function () {
            const op = notification.op;
            if (notification.dropCollection || notification.dropDatabase) {
              // Note: this call is not allowed to block on anything (especially
              // on waiting for oplog entries to catch up) because that will block
              // onOplogEntry!
              return self._needToPollQuery();
            } else {
              // All other operators should be handled depending on phase
              if (self._phase === PHASE.QUERYING) {
                return self._handleOplogEntryQuerying(op);
              } else {
                return self._handleOplogEntrySteadyOrFetching(op);
              }
            }
          })();
        }
      ));
    });
  
    // XXX ordering w.r.t. everything else?
    self._addStopHandles(await listenAll(
      self._cursorDescription, function () {
        // If we're not in a pre-fire write fence, we don't have to do anything.
        const fence = DDPServer._getCurrentFence();
        if (!fence || fence.fired)
          return;
  
        if (fence._oplogObserveDrivers) {
          fence._oplogObserveDrivers[self._id] = self;
          return;
        }
  
        fence._oplogObserveDrivers = {};
        fence._oplogObserveDrivers[self._id] = self;
  
        fence.onBeforeFire(async function () {
          const drivers = fence._oplogObserveDrivers;
          delete fence._oplogObserveDrivers;
  
          // This fence cannot fire until we've caught up to "this point" in the
          // oplog, and all observers made it back to the steady state.
          await self._mongoHandle._oplogHandle.waitUntilCaughtUp();
  
          for (const driver of Object.values(drivers)) {
            if (driver._stopped)
              continue;
  
            const write = await fence.beginWrite();
            if (driver._phase === PHASE.STEADY) {
              // Make sure that all of the callbacks have made it through the
              // multiplexer and been delivered to ObserveHandles before committing
              // writes.
              await driver._multiplexer.onFlush(write.committed);
            } else {
              driver._writesToCommitWhenWeReachSteady.push(write);
            }
          }
        });
      }
    ));
  
    // When Mongo fails over, we need to repoll the query, in case we processed an
    // oplog entry that got rolled back.
    self._addStopHandles(self._mongoHandle._onFailover(finishIfNeedToPollQuery(
      function () {
        return self._needToPollQuery();
      })));
  
    // Give _observeChanges a chance to add the new ObserveHandle to our
    // multiplexer, so that the added calls get streamed.
    return self._runInitialQuery();
  },
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
      if (self._phase === PHASE.QUERYING)
        return;

      // (b) We're pretty confident that the union of _published and
      // _unpublishedBuffer contain all documents that match selector. Because
      // _unpublishedBuffer is empty, that means we're confident that _published
      // contains all documents that match selector. So we have nothing to do.
      if (self._safeAppendToBuffer)
        return;

      // (c) Maybe there are other documents out there that should be in our
      // buffer. But in that case, when we emptied _unpublishedBuffer in
      // _removeBuffered, we should have called _needToPollQuery, which will
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
        self._needToPollQuery();
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
              self._needToPollQuery();
            }
          }
        } else {
          throw new Error("cachedBefore implies either of publishedBefore or bufferedBefore is true.");
        }
      }
    });
  },
  _fetchModifiedDocuments: function () {
    var self = this;
    self._registerPhaseChange(PHASE.FETCHING);
    // Defer, because nothing called from the oplog entry handler may yield,
    // but fetch() yields.
    Meteor.defer(finishIfNeedToPollQuery(async function () {
      while (!self._stopped && !self._needToFetch.empty()) {
        if (self._phase === PHASE.QUERYING) {
          // While fetching, we decided to go into QUERYING mode, and then we
          // saw another oplog entry, so _needToFetch is not empty. But we
          // shouldn't fetch these documents until AFTER the query is done.
          break;
        }

        // Being in steady phase here would be surprising.
        if (self._phase !== PHASE.FETCHING)
          throw new Error("phase in fetchModifiedDocuments: " + self._phase);

        self._currentlyFetching = self._needToFetch;
        var thisGeneration = ++self._fetchGeneration;
        self._needToFetch = new LocalCollection._IdMap;
        var waiting = 0;

        let promiseResolver = null;
        const awaitablePromise = new Promise(r => promiseResolver = r);
        // This loop is safe, because _currentlyFetching will not be updated
        // during this loop (in fact, it is never mutated).
        await self._currentlyFetching.forEachAsync(async function (op, id) {
          waiting++;
          await self._mongoHandle._docFetcher.fetch(
            self._cursorDescription.collectionName,
            id,
            op,
            finishIfNeedToPollQuery(function(err, doc) {
              if (err) {
                Meteor._debug('Got exception while fetching documents', err);
                // If we get an error from the fetcher (eg, trouble
                // connecting to Mongo), let's just abandon the fetch phase
                // altogether and fall back to polling. It's not like we're
                // getting live updates anyway.
                if (self._phase !== PHASE.QUERYING) {
                  self._needToPollQuery();
                }
                waiting--;
                // Because fetch() never calls its callback synchronously,
                // this is safe (ie, we won't call fut.return() before the
                // forEach is done).
                if (waiting === 0) promiseResolver();
                return;
              }

              try {
                if (
                  !self._stopped &&
                  self._phase === PHASE.FETCHING &&
                  self._fetchGeneration === thisGeneration
                ) {
                  // We re-check the generation in case we've had an explicit
                  // _pollQuery call (eg, in another fiber) which should
                  // effectively cancel this round of fetches.  (_pollQuery
                  // increments the generation.)

                  self._handleDoc(id, doc);
                }
              } finally {
                waiting--;
                // Because fetch() never calls its callback synchronously,
                // this is safe (ie, we won't call fut.return() before the
                // forEach is done).
                if (waiting === 0) promiseResolver();
              }
            })
          );
        });
        await awaitablePromise;
        // Exit now if we've had a _pollQuery call (here or in another fiber).
        if (self._phase === PHASE.QUERYING)
          return;
        self._currentlyFetching = null;
      }
      // We're done fetching, so we can be steady, unless we've had a
      // _pollQuery call (here or in another fiber).
      if (self._phase !== PHASE.QUERYING)
        await self._beSteady();
    }));
  },
  _beSteady: async function () {
    var self = this;
    self._registerPhaseChange(PHASE.STEADY);
    var writes = self._writesToCommitWhenWeReachSteady || [];
    self._writesToCommitWhenWeReachSteady = [];
    await self._multiplexer.onFlush(async function () {
      try {
        for (const w of writes) {
          await w.committed();
        }
      } catch (e) {
        console.error("_beSteady error", {writes}, e);
      }
    });
  },
  _handleOplogEntryQuerying: function (op) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      self._needToFetch.set(idForOp(op), op);
    });
  },
  _handleOplogEntrySteadyOrFetching: function (op) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var id = idForOp(op);
      // If we're already fetching this one, or about to, we can't optimize;
      // make sure that we fetch it again if necessary.

      if (self._phase === PHASE.FETCHING &&
          ((self._currentlyFetching && self._currentlyFetching.has(id)) ||
           self._needToFetch.has(id))) {
        self._needToFetch.set(id, op);
        return;
      }

      if (op.op === 'd') {
        if (self._published.has(id) ||
            (self._limit && self._unpublishedBuffer.has(id)))
          self._removeMatching(id);
      } else if (op.op === 'i') {
        if (self._published.has(id))
          throw new Error("insert found for already-existing ID in published");
        if (self._unpublishedBuffer && self._unpublishedBuffer.has(id))
          throw new Error("insert found for already-existing ID in buffer");

        // XXX what if selector yields?  for now it can't but later it could
        // have $where
        if (self._matcher.documentMatches(op.o).result)
          self._addMatching(op.o);
      } else if (op.op === 'u') {
        // we are mapping the new oplog format on mongo 5
        // to what we know better, $set
        op.o = oplogV2V1Converter(op.o)
        // Is this a modifier ($set/$unset, which may require us to poll the
        // database to figure out if the whole document matches the selector) or
        // a replacement (in which case we can just directly re-evaluate the
        // selector)?
        // oplog format has changed on mongodb 5, we have to support both now
        // diff is the format in Mongo 5+ (oplog v2)
        var isReplace = !has(op.o, '$set') && !has(op.o, 'diff') && !has(op.o, '$unset');
        // If this modifier modifies something inside an EJSON custom type (ie,
        // anything with EJSON$), then we can't try to use
        // LocalCollection._modify, since that just mutates the EJSON encoding,
        // not the actual object.
        var canDirectlyModifyDoc =
          !isReplace && modifierCanBeDirectlyApplied(op.o);

        var publishedBefore = self._published.has(id);
        var bufferedBefore = self._limit && self._unpublishedBuffer.has(id);

        if (isReplace) {
          self._handleDoc(id, Object.assign({_id: id}, op.o));
        } else if ((publishedBefore || bufferedBefore) &&
                   canDirectlyModifyDoc) {
          // Oh great, we actually know what the document is, so we can apply
          // this directly.
          var newDoc = self._published.has(id)
            ? self._published.get(id) : self._unpublishedBuffer.get(id);
          newDoc = EJSON.clone(newDoc);

          newDoc._id = id;
          try {
            LocalCollection._modify(newDoc, op.o);
          } catch (e) {
            if (e.name !== "MinimongoError")
              throw e;
            // We didn't understand the modifier.  Re-fetch.
            self._needToFetch.set(id, op);
            if (self._phase === PHASE.STEADY) {
              self._fetchModifiedDocuments();
            }
            return;
          }
          self._handleDoc(id, self._sharedProjectionFn(newDoc));
        } else if (!canDirectlyModifyDoc ||
                   self._matcher.canBecomeTrueByModifier(op.o) ||
                   (self._sorter && self._sorter.affectedByModifier(op.o))) {
          self._needToFetch.set(id, op);
          if (self._phase === PHASE.STEADY)
            self._fetchModifiedDocuments();
        }
      } else {
        throw Error("XXX SURPRISING OPERATION: " + op);
      }
    });
  },

  async _runInitialQueryAsync() {
    var self = this;
    if (self._stopped)
      throw new Error("oplog stopped surprisingly early");

    await self._runQuery({initial: true});  // yields

    if (self._stopped)
      return;  // can happen on queryError

    // Allow observeChanges calls to return. (After this, it's possible for
    // stop() to be called.)
    await self._multiplexer.ready();

    await self._doneQuerying();  // yields
  },

  // Yields!
  _runInitialQuery: function () {
    return this._runInitialQueryAsync();
  },

  // In various circumstances, we may just want to stop processing the oplog and
  // re-run the initial query, just as if we were a PollingObserveDriver.
  //
  // This function may not block, because it is called from an oplog entry
  // handler.
  //
  // XXX We should call this when we detect that we've been in FETCHING for "too
  // long".
  //
  // XXX We should call this when we detect Mongo failover (since that might
  // mean that some of the oplog entries we have processed have been rolled
  // back). The Node Mongo driver is in the middle of a bunch of huge
  // refactorings, including the way that it notifies you when primary
  // changes. Will put off implementing this until driver 1.4 is out.
  _pollQuery: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      if (self._stopped)
        return;

      // Yay, we get to forget about all the things we thought we had to fetch.
      self._needToFetch = new LocalCollection._IdMap;
      self._currentlyFetching = null;
      ++self._fetchGeneration;  // ignore any in-flight fetches
      self._registerPhaseChange(PHASE.QUERYING);

      // Defer so that we don't yield.  We don't need finishIfNeedToPollQuery
      // here because SwitchedToQuery is not thrown in QUERYING mode.
      Meteor.defer(async function () {
        await self._runQuery();
        await self._doneQuerying();
      });
    });
  },

  // Yields!
  async _runQueryAsync(options) {
    var self = this;
    options = options || {};
    var newResults, newBuffer;

    // This while loop is just to retry failures.
    while (true) {
      // If we've been stopped, we don't have to run anything any more.
      if (self._stopped)
        return;

      newResults = new LocalCollection._IdMap;
      newBuffer = new LocalCollection._IdMap;

      // Query 2x documents as the half excluded from the original query will go
      // into unpublished buffer to reduce additional Mongo lookups in cases
      // when documents are removed from the published set and need a
      // replacement.
      // XXX needs more thought on non-zero skip
      // XXX 2 is a "magic number" meaning there is an extra chunk of docs for
      // buffer if such is needed.
      var cursor = self._cursorForQuery({ limit: self._limit * 2 });
      try {
        await cursor.forEach(function (doc, i) {  // yields
          if (!self._limit || i < self._limit) {
            newResults.set(doc._id, doc);
          } else {
            newBuffer.set(doc._id, doc);
          }
        });
        break;
      } catch (e) {
        if (options.initial && typeof(e.code) === 'number') {
          // This is an error document sent to us by mongod, not a connection
          // error generated by the client. And we've never seen this query work
          // successfully. Probably it's a bad selector or something, so we
          // should NOT retry. Instead, we should halt the observe (which ends
          // up calling `stop` on us).
          await self._multiplexer.queryError(e);
          return;
        }

        // During failover (eg) if we get an exception we should log and retry
        // instead of crashing.
        Meteor._debug("Got exception while polling query", e);
        await Meteor._sleepForMs(100);
      }
    }

    if (self._stopped)
      return;

    self._publishNewResults(newResults, newBuffer);
  },

  // Yields!
  _runQuery: function (options) {
    return this._runQueryAsync(options);
  },

  // Transitions to QUERYING and runs another query, or (if already in QUERYING)
  // ensures that we will query again later.
  //
  // This function may not block, because it is called from an oplog entry
  // handler. However, if we were not already in the QUERYING phase, it throws
  // an exception that is caught by the closest surrounding
  // finishIfNeedToPollQuery call; this ensures that we don't continue running
  // close that was designed for another phase inside PHASE.QUERYING.
  //
  // (It's also necessary whenever logic in this file yields to check that other
  // phases haven't put us into QUERYING mode, though; eg,
  // _fetchModifiedDocuments does this.)
  _needToPollQuery: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      if (self._stopped)
        return;

      // If we're not already in the middle of a query, we can query now
      // (possibly pausing FETCHING).
      if (self._phase !== PHASE.QUERYING) {
        self._pollQuery();
        throw new SwitchedToQuery;
      }

      // We're currently in QUERYING. Set a flag to ensure that we run another
      // query when we're done.
      self._requeryWhenDoneThisQuery = true;
    });
  },

  // Yields!
  _doneQuerying: async function () {
    var self = this;

    if (self._stopped)
      return;

    await self._mongoHandle._oplogHandle.waitUntilCaughtUp();

    if (self._stopped)
      return;

    if (self._phase !== PHASE.QUERYING)
      throw Error("Phase unexpectedly " + self._phase);

    if (self._requeryWhenDoneThisQuery) {
      self._requeryWhenDoneThisQuery = false;
      self._pollQuery();
    } else if (self._needToFetch.empty()) {
      await self._beSteady();
    } else {
      self._fetchModifiedDocuments();
    }
  },

  _cursorForQuery: function (optionsOverwrite) {
    var self = this;
    return Meteor._noYieldsAllowed(function () {
      // The query we run is almost the same as the cursor we are observing,
      // with a few changes. We need to read all the fields that are relevant to
      // the selector, not just the fields we are going to publish (that's the
      // "shared" projection). And we don't want to apply any transform in the
      // cursor, because observeChanges shouldn't use the transform.
      var options = Object.assign({}, self._cursorDescription.options);

      // Allow the caller to modify the options. Useful to specify different
      // skip and limit values.
      Object.assign(options, optionsOverwrite);

      options.fields = self._sharedProjection;
      delete options.transform;
      // We are NOT deep cloning fields or selector here, which should be OK.
      var description = new CursorDescription(
        self._cursorDescription.collectionName,
        self._cursorDescription.selector,
        options);
      return new Cursor(self._mongoHandle, description);
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
  },

  // This stop function is invoked from the onStop of the ObserveMultiplexer, so
  // it shouldn't actually be possible to call it until the multiplexer is
  // ready.
  //
  // It's important to check self._stopped after every call in this file that
  // can yield!
  _stop: async function() {
    var self = this;
    if (self._stopped)
      return;
    self._stopped = true;

    // Note: we *don't* use multiplexer.onFlush here because this stop
    // callback is actually invoked by the multiplexer itself when it has
    // determined that there are no handles left. So nothing is actually going
    // to get flushed (and it's probably not valid to call methods on the
    // dying multiplexer).
    for (const w of self._writesToCommitWhenWeReachSteady) {
      await w.committed();
    }
    self._writesToCommitWhenWeReachSteady = null;

    // Proactively drop references to potentially big things.
    self._published = null;
    self._unpublishedBuffer = null;
    self._needToFetch = null;
    self._currentlyFetching = null;
    self._oplogEntryHandle = null;
    self._listenersHandle = null;

    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
        "mongo-livedata", "observe-drivers-oplog", -1);

    for await (const handle of self._stopHandles) {
      await handle.stop();
    }
  },
  stop: async function() {
    const self = this;
    return await self._stop();
  },

  _registerPhaseChange: function (phase) {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      var now = new Date;

      if (self._phase) {
        var timeDiff = now - self._phaseStartTime;
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
          "mongo-livedata", "time-spent-in-" + self._phase + "-phase", timeDiff);
      }

      self._phase = phase;
      self._phaseStartTime = now;
    });
  }
});

// Does our oplog tailing code support this cursor? For now, we are being very
// conservative and allowing only simple queries with simple options.
// (This is a "static method".)
OplogObserveDriver.cursorSupported = function (cursorDescription, matcher) {
  // First, check the options.
  var options = cursorDescription.options;

  // Did the user say no explicitly?
  // underscored version of the option is COMPAT with 1.2
  if (options.disableOplog || options._disableOplog)
    return false;

  // skip is not supported: to support it we would need to keep track of all
  // "skipped" documents or at least their ids.
  // limit w/o a sort specifier is not supported: current implementation needs a
  // deterministic way to order documents.
  if (options.skip || (options.limit && !options.sort)) return false;

  // If a fields projection option is given check if it is supported by
  // minimongo (some operators are not supported).
  const fields = options.fields || options.projection;
  if (fields) {
    try {
      LocalCollection._checkSupportedProjection(fields);
    } catch (e) {
      if (e.name === "MinimongoError") {
        return false;
      } else {
        throw e;
      }
    }
  }

  // We don't allow the following selectors:
  //   - $where (not confident that we provide the same JS environment
  //             as Mongo, and can yield!)
  //   - $near (has "interesting" properties in MongoDB, like the possibility
  //            of returning an ID multiple times, though even polling maybe
  //            have a bug there)
  //           XXX: once we support it, we would need to think more on how we
  //           initialize the comparators when we create the driver.
  return !matcher.hasWhere() && !matcher.hasGeoQuery();
};

var modifierCanBeDirectlyApplied = function (modifier) {
  return Object.entries(modifier).every(function ([operation, fields]) {
    return Object.entries(fields).every(function ([field, value]) {
      return !/EJSON\$/.test(field);
    });
  });
};

MongoInternals.OplogObserveDriver = OplogObserveDriver;