var Fiber = Npm.require('fibers');
var Future = Npm.require('fibers/future');

var PHASE = {
  QUERYING: 1,
  FETCHING: 2,
  STEADY: 3
};

// OplogObserveDriver is an alternative to PollingObserveDriver which follows
// the Mongo operation log instead of just re-polling the query. It obeys the
// same simple interface: constructing it starts sending observeChanges
// callbacks (and a ready() invocation) to the ObserveMultiplexer, and you stop
// it by calling the stop() method.
OplogObserveDriver = function (options) {
  var self = this;
  self._usesOplog = true;  // tests look at this

  self._cursorDescription = options.cursorDescription;
  self._mongoHandle = options.mongoHandle;
  self._multiplexer = options.multiplexer;
  if (options.ordered)
    throw Error("OplogObserveDriver only supports unordered observeChanges");

  self._stopped = false;
  self._stopHandles = [];

  Package.facts && Package.facts.Facts.incrementServerFact(
    "mongo-livedata", "observe-drivers-oplog", 1);

  self._phase = PHASE.QUERYING;

  self._published = new LocalCollection._IdMap;
  var selector = self._cursorDescription.selector;
  self._selectorFn = LocalCollection._compileSelector(
    self._cursorDescription.selector);
  var projection = self._cursorDescription.options.fields || {};
  self._projectionFn = LocalCollection._compileProjection(projection);
  // Projection function, result of combining important fields for selector and
  // existing fields projection
  self._sharedProjection = LocalCollection._combineSelectorAndProjection(
    selector, projection);
  self._sharedProjectionFn = LocalCollection._compileProjection(
    self._sharedProjection);

  self._needToFetch = new LocalCollection._IdMap;
  self._currentlyFetching = null;
  self._fetchGeneration = 0;

  self._requeryWhenDoneThisQuery = false;
  self._writesToCommitWhenWeReachSteady = [];

  forEachTrigger(self._cursorDescription, function (trigger) {
    self._stopHandles.push(self._mongoHandle._oplogHandle.onOplogEntry(
      trigger, function (notification) {
        var op = notification.op;
        if (notification.dropCollection) {
          // Note: this call is not allowed to block on anything (especially on
          // waiting for oplog entries to catch up) because that will block
          // onOplogEntry!
          self._needToPollQuery();
        } else {
          // All other operators should be handled depending on phase
          if (self._phase === PHASE.QUERYING)
            self._handleOplogEntryQuerying(op);
          else
            self._handleOplogEntrySteadyOrFetching(op);
        }
      }
    ));
  });

  // XXX ordering w.r.t. everything else?
  self._stopHandles.push(listenAll(
    self._cursorDescription, function (notification, complete) {
      // If we're not in a write fence, we don't have to do anything.
      var fence = DDPServer._CurrentWriteFence.get();
      if (!fence) {
        complete();
        return;
      }
      var write = fence.beginWrite();
      // This write cannot complete until we've caught up to "this point" in the
      // oplog, and then made it back to the steady state.
      Meteor.defer(function () {
        self._mongoHandle._oplogHandle.waitUntilCaughtUp();
        if (self._stopped) {
          // We're stopped, so just immediately commit.
          write.committed();
        } else if (self._phase === PHASE.STEADY) {
          // Make sure that all of the callbacks have made it through the
          // multiplexer and been delivered to ObserveHandles before committing
          // writes.
          self._multiplexer.onFlush(function () {
            write.committed();
          });
        } else {
          self._writesToCommitWhenWeReachSteady.push(write);
        }
      });
      complete();
    }
  ));

  // Give _observeChanges a chance to add the new ObserveHandle to our
  // multiplexer, so that the added calls get streamed.
  Meteor.defer(function () {
    self._runInitialQuery();
  });
};

_.extend(OplogObserveDriver.prototype, {
  _add: function (doc) {
    var self = this;
    var id = doc._id;
    var fields = _.clone(doc);
    delete fields._id;
    if (self._published.has(id))
      throw Error("tried to add something already published " + id);
    self._published.set(id, self._sharedProjectionFn(fields));
    self._multiplexer.added(id, self._projectionFn(fields));
  },
  _remove: function (id) {
    var self = this;
    if (!self._published.has(id))
      throw Error("tried to remove something unpublished " + id);
    self._published.remove(id);
    self._multiplexer.removed(id);
  },
  _handleDoc: function (id, newDoc, mustMatchNow) {
    var self = this;
    newDoc = _.clone(newDoc);

    var matchesNow = newDoc && self._selectorFn(newDoc);
    if (mustMatchNow && !matchesNow) {
      throw Error("expected " + EJSON.stringify(newDoc) + " to match "
                  + EJSON.stringify(self._cursorDescription));
    }

    var matchedBefore = self._published.has(id);

    if (matchesNow && !matchedBefore) {
      self._add(newDoc);
    } else if (matchedBefore && !matchesNow) {
      self._remove(id);
    } else if (matchesNow) {
      var oldDoc = self._published.get(id);
      if (!oldDoc)
        throw Error("thought that " + id + " was there!");
      delete newDoc._id;
      self._published.set(id, self._sharedProjectionFn(newDoc));
      var changed = LocalCollection._makeChangedFields(_.clone(newDoc), oldDoc);
      changed = self._projectionFn(changed);
      if (!_.isEmpty(changed))
        self._multiplexer.changed(id, changed);
    }
  },
  _fetchModifiedDocuments: function () {
    var self = this;
    self._phase = PHASE.FETCHING;
    while (!self._stopped && !self._needToFetch.empty()) {
      if (self._phase !== PHASE.FETCHING)
        throw new Error("phase in fetchModifiedDocuments: " + self._phase);

      self._currentlyFetching = self._needToFetch;
      var thisGeneration = ++self._fetchGeneration;
      self._needToFetch = new LocalCollection._IdMap;
      var waiting = 0;
      var anyError = null;
      var fut = new Future;
      // This loop is safe, because _currentlyFetching will not be updated
      // during this loop (in fact, it is never mutated).
      self._currentlyFetching.forEach(function (cacheKey, id) {
        waiting++;
        self._mongoHandle._docFetcher.fetch(
          self._cursorDescription.collectionName, id, cacheKey,
          function (err, doc) {
            if (err) {
              if (!anyError)
                anyError = err;
            } else if (!self._stopped && self._phase === PHASE.FETCHING
                       && self._fetchGeneration === thisGeneration) {
              // We re-check the generation in case we've had an explicit
              // _pollQuery call which should effectively cancel this round of
              // fetches.  (_pollQuery increments the generation.)
              self._handleDoc(id, doc);
            }
            waiting--;
            // Because fetch() never calls its callback synchronously, this is
            // safe (ie, we won't call fut.return() before the forEach is done).
            if (waiting === 0)
              fut.return();
          });
      });
      fut.wait();
      // XXX do this even if we've switched to PHASE.QUERYING?
      if (anyError)
        throw anyError;
      // Exit now if we've had a _pollQuery call.
      if (self._phase === PHASE.QUERYING)
        return;
      self._currentlyFetching = null;
    }
    self._beSteady();
  },
  _beSteady: function () {
    var self = this;
    self._phase = PHASE.STEADY;
    var writes = self._writesToCommitWhenWeReachSteady;
    self._writesToCommitWhenWeReachSteady = [];
    self._multiplexer.onFlush(function () {
      _.each(writes, function (w) {
        w.committed();
      });
    });
  },
  _handleOplogEntryQuerying: function (op) {
    var self = this;
    self._needToFetch.set(idForOp(op), op.ts.toString());
  },
  _handleOplogEntrySteadyOrFetching: function (op) {
    var self = this;
    var id = idForOp(op);
    // If we're already fetching this one, or about to, we can't optimize; make
    // sure that we fetch it again if necessary.
    if (self._phase === PHASE.FETCHING &&
        (self._currentlyFetching.has(id) || self._needToFetch.has(id))) {
      self._needToFetch.set(id, op.ts.toString());
      return;
    }

    if (op.op === 'd') {
      if (self._published.has(id))
        self._remove(id);
    } else if (op.op === 'i') {
      if (self._published.has(id))
        throw new Error("insert found for already-existing ID");

      // XXX what if selector yields?  for now it can't but later it could have
      // $where
      if (self._selectorFn(op.o))
        self._add(op.o);
    } else if (op.op === 'u') {
      // Is this a modifier ($set/$unset, which may require us to poll the
      // database to figure out if the whole document matches the selector) or a
      // replacement (in which case we can just directly re-evaluate the
      // selector)?
      var isReplace = !_.has(op.o, '$set') && !_.has(op.o, '$unset');
      // If this modifier modifies something inside an EJSON custom type (ie,
      // anything with EJSON$), then we can't try to use
      // LocalCollection._modify, since that just mutates the EJSON encoding,
      // not the actual object.
      var canDirectlyModifyDoc =
            !isReplace && modifierCanBeDirectlyApplied(op.o);

      if (isReplace) {
        self._handleDoc(id, _.extend({_id: id}, op.o));
      } else if (self._published.has(id) && canDirectlyModifyDoc) {
        // Oh great, we actually know what the document is, so we can apply
        // this directly.
        var newDoc = EJSON.clone(self._published.get(id));
        newDoc._id = id;
        LocalCollection._modify(newDoc, op.o);
        self._handleDoc(id, self._sharedProjectionFn(newDoc));
      } else if (!canDirectlyModifyDoc ||
                 LocalCollection._canSelectorBecomeTrueByModifier(
                   self._cursorDescription.selector, op.o)) {
        self._needToFetch.set(id, op.ts.toString());
        if (self._phase === PHASE.STEADY)
          self._fetchModifiedDocuments();
      }
    } else {
      throw Error("XXX SURPRISING OPERATION: " + op);
    }
  },
  _runInitialQuery: function () {
    var self = this;
    if (self._stopped)
      throw new Error("oplog stopped surprisingly early");

    var initialCursor = self._cursorForQuery();
    initialCursor.forEach(function (initialDoc) {
      self._add(initialDoc);
    });
    if (self._stopped)
      throw new Error("oplog stopped quite early");
    // Allow observeChanges calls to return. (After this, it's possible for
    // stop() to be called.)
    self._multiplexer.ready();

    self._doneQuerying();
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

    if (self._stopped)
      return;

    // Yay, we get to forget about all the things we thought we had to fetch.
    self._needToFetch = new LocalCollection._IdMap;
    self._currentlyFetching = null;
    ++self._fetchGeneration;  // ignore any in-flight fetches
    self._phase = PHASE.QUERYING;

    // Defer so that we don't block.
    Meteor.defer(function () {
      // subtle note: _published does not contain _id fields, but newResults
      // does
      var newResults = new LocalCollection._IdMap;
      var cursor = self._cursorForQuery();
      cursor.forEach(function (doc) {
        newResults.set(doc._id, doc);
      });

      self._publishNewResults(newResults);

      self._doneQuerying();
    });
  },

  // Transitions to QUERYING and runs another query, or (if already in QUERYING)
  // ensures that we will query again later.
  //
  // This function may not block, because it is called from an oplog entry
  // handler.
  _needToPollQuery: function () {
    var self = this;
    if (self._stopped)
      return;

    // If we're not already in the middle of a query, we can query now (possibly
    // pausing FETCHING).
    if (self._phase !== PHASE.QUERYING) {
      self._pollQuery();
      return;
    }

    // We're currently in QUERYING. Set a flag to ensure that we run another
    // query when we're done.
    self._requeryWhenDoneThisQuery = true;
  },

  _doneQuerying: function () {
    var self = this;

    if (self._stopped)
      return;
    self._mongoHandle._oplogHandle.waitUntilCaughtUp();

    if (self._stopped)
      return;
    if (self._phase !== PHASE.QUERYING)
      throw Error("Phase unexpectedly " + self._phase);

    if (self._requeryWhenDoneThisQuery) {
      self._requeryWhenDoneThisQuery = false;
      self._pollQuery();
    } else if (self._needToFetch.empty()) {
      self._beSteady();
    } else {
      self._fetchModifiedDocuments();
    }
  },

  _cursorForQuery: function () {
    var self = this;

    // The query we run is almost the same as the cursor we are observing, with
    // a few changes. We need to read all the fields that are relevant to the
    // selector, not just the fields we are going to publish (that's the
    // "shared" projection). And we don't want to apply any transform in the
    // cursor, because observeChanges shouldn't use the transform.
    var options = _.clone(self._cursorDescription.options);
    options.fields = self._sharedProjection;
    delete options.transform;
    // We are NOT deep cloning fields or selector here, which should be OK.
    var description = new CursorDescription(
      self._cursorDescription.collectionName,
      self._cursorDescription.selector,
      options);
    return new Cursor(self._mongoHandle, description);
  },


  // Replace self._published with newResults (both are IdMaps), invoking observe
  // callbacks on the multiplexer.
  //
  // XXX This is very similar to LocalCollection._diffQueryUnorderedChanges. We
  // should really: (a) Unify IdMap and OrderedDict into Unordered/OrderedDict (b)
  // Rewrite diff.js to use these classes instead of arrays and objects.
  _publishNewResults: function (newResults) {
    var self = this;

    // First remove anything that's gone. Be careful not to modify
    // self._published while iterating over it.
    var idsToRemove = [];
    self._published.forEach(function (doc, id) {
      if (!newResults.has(id))
        idsToRemove.push(id);
    });
    _.each(idsToRemove, function (id) {
      self._remove(id);
    });

    // Now do adds and changes.
    newResults.forEach(function (doc, id) {
      // "true" here means to throw if we think this doc doesn't match the
      // selector.
      self._handleDoc(id, doc, true);
    });
  },

  // This stop function is invoked from the onStop of the ObserveMultiplexer, so
  // it shouldn't actually be possible to call it until the multiplexer is
  // ready.
  stop: function () {
    var self = this;
    if (self._stopped)
      return;
    self._stopped = true;
    _.each(self._stopHandles, function (handle) {
      handle.stop();
    });

    // Note: we *don't* use multiplexer.onFlush here because this stop
    // callback is actually invoked by the multiplexer itself when it has
    // determined that there are no handles left. So nothing is actually going
    // to get flushed (and it's probably not valid to call methods on the
    // dying multiplexer).
    _.each(self._writesToCommitWhenWeReachSteady, function (w) {
      w.committed();
    });
    self._writesToCommitWhenWeReachSteady = null;

    // Proactively drop references to potentially big things.
    self._published = null;
    self._needToFetch = null;
    self._currentlyFetching = null;
    self._oplogEntryHandle = null;
    self._listenersHandle = null;

    Package.facts && Package.facts.Facts.incrementServerFact(
      "mongo-livedata", "observe-drivers-oplog", -1);
  }
});

// Does our oplog tailing code support this cursor? For now, we are being very
// conservative and allowing only simple queries with simple options.
// (This is a "static method".)
OplogObserveDriver.cursorSupported = function (cursorDescription) {
  // First, check the options.
  var options = cursorDescription.options;

  // Did the user say no explicitly?
  if (options._disableOplog)
    return false;

  // This option (which are mostly used for sorted cursors) require us to figure
  // out where a given document fits in an order to know if it's included or
  // not, and we don't track that information when doing oplog tailing.
  if (options.limit || options.skip) return false;

  // If a fields projection option is given check if it is supported by
  // minimongo (some operators are not supported).
  if (options.fields) {
    try {
      LocalCollection._checkSupportedProjection(options.fields);
    } catch (e) {
      if (e.name === "MinimongoError")
        return false;
      else
        throw e;
    }
  }

  // For now, we're just dealing with equality queries: no $operators, regexps,
  // or $and/$or/$where/etc clauses. We can expand the scope of what we're
  // comfortable processing later. ($where will get pretty scary since it will
  // allow selector processing to yield!)
  return _.all(cursorDescription.selector, function (value, field) {
    // No logical operators like $and.
    if (field.substr(0, 1) === '$')
      return false;
    // We only allow scalars, not sub-documents or $operators or RegExp.
    // XXX Date would be easy too, though I doubt anyone is doing equality
    // lookups on dates
    return typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null ||
      value instanceof Meteor.Collection.ObjectID;
  });
};

var modifierCanBeDirectlyApplied = function (modifier) {
  return _.all(modifier, function (fields, operation) {
    return _.all(fields, function (value, field) {
      return !/EJSON\$/.test(field);
    });
  });
};

MongoTest.OplogObserveDriver = OplogObserveDriver;
