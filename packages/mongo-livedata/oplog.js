var Fiber = Npm.require('fibers');
var Future = Npm.require('fibers/future');

var PHASE = {
  INITIALIZING: 1,
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

  self._cursorDescription = options.cursorDescription;
  self._mongoHandle = options.mongoHandle;
  self._multiplexer = options.multiplexer;
  if (options.ordered)
    throw Error("OplogObserveDriver only supports unordered observeChanges");

  self._stopped = false;
  self._stopHandles = [];

  Package.facts && Package.facts.Facts.incrementServerFact(
    "mongo-livedata", "oplog-observers", 1);

  self._phase = PHASE.INITIALIZING;

  self._published = new LocalCollection._IdMap;
  var selector = self._cursorDescription.selector;
  self._selectorFn = LocalCollection._compileSelector(
    self._cursorDescription.selector);
  var projection = self._cursorDescription.options.fields || {};
  self._projectionFn = LocalCollection._compileProjection(projection);
  // Projection function, result of combining important fields for selector and
  // existing fields projection
  var sharedProjection = LocalCollection._combineSelectorAndProjection(
    selector, projection);
  self._sharedProjectionFn = LocalCollection._compileProjection(
    sharedProjection);

  self._needToFetch = new LocalCollection._IdMap;
  self._currentlyFetching = new LocalCollection._IdMap;

  self._writesToCommitWhenWeReachSteady = [];

  forEachTrigger(self._cursorDescription, function (trigger) {
    self._stopHandles.push(self._mongoHandle._oplogHandle.onOplogEntry(
      trigger, function (notification) {
        var op = notification.op;
        if (op.op === 'c') {
          // XXX actually, drop collection needs to be handled by doing a
          // re-query
          self._published.forEach(function (fields, id) {
            self._remove(id);
          });
        } else {
          // All other operators should be handled depending on phase
          if (self._phase === PHASE.INITIALIZING)
            self._handleOplogEntryInitializing(op);
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
      Meteor.defer(complete);
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
  _handleDoc: function (id, newDoc) {
    var self = this;
    newDoc = _.clone(newDoc);
    var matchesNow = newDoc && self._selectorFn(newDoc);
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
      self._needToFetch = new LocalCollection._IdMap;
      var waiting = 0;
      var error = null;
      var fut = new Future;
      Fiber(function () {
        self._currentlyFetching.forEach(function (cacheKey, id) {
          // currentlyFetching will not be updated during this loop.
          waiting++;
          self._mongoHandle._docFetcher.fetch(
            self._cursorDescription.collectionName, id, cacheKey,
            function (err, doc) {
              if (err) {
                if (!error)
                  error = err;
              } else if (!self._stopped) {
                self._handleDoc(id, doc);
              }
              waiting--;
              if (waiting == 0)
                fut.return();
            });
        });
      }).run();
      fut.wait();
      if (error)
        throw error;
      self._currentlyFetching = new LocalCollection._IdMap;
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
  _handleOplogEntryInitializing: function (op) {
    var self = this;
    self._needToFetch.set(idForOp(op), op.ts.toString());
  },
  _handleOplogEntrySteadyOrFetching: function (op) {
    var self = this;
    var id = idForOp(op);
    // If we're already fetching this one, or about to, we can't optimize; make
    // sure that we fetch it again if necessary.
    if (self._currentlyFetching.has(id) || self._needToFetch.has(id)) {
      if (self._phase !== PHASE.FETCHING)
        throw Error("map not empty during steady phase");
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

      if (isReplace) {
        self._handleDoc(id, _.extend({_id: id}, op.o));
      } else if (self._published.has(id)) {
        // Oh great, we actually know what the document is, so we can apply
        // this directly.
        var newDoc = EJSON.clone(self._published.get(id));
        newDoc._id = id;
        LocalCollection._modify(newDoc, op.o);
        self._handleDoc(id, self._sharedProjectionFn(newDoc));
      } else if (LocalCollection._canSelectorBecomeTrueByModifier(
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

    var initialCursor = new Cursor(self._mongoHandle, self._cursorDescription);
    initialCursor.forEach(function (initialDoc) {
      self._add(initialDoc);
    });
    if (self._stopped)
      throw new Error("oplog stopped quite early");
    // Allow observeChanges calls to return. (After this, it's possible for
    // stop() to be called.)
    self._multiplexer.ready();

    if (self._stopped)
      return;
    self._mongoHandle._oplogHandle.waitUntilCaughtUp();

    if (self._stopped)
      return;
    if (self._phase !== PHASE.INITIALIZING)
      throw Error("Phase unexpectedly " + self._phase);

    if (self._needToFetch.empty()) {
      self._beSteady();
    } else {
      self._fetchModifiedDocuments();
    }
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
      "mongo-livedata", "oplog-observers", -1);
  }
});

idForOp = function (op) {
  if (op.op === 'd')
    return op.o._id;
  else if (op.op === 'i')
    return op.o._id;
  else if (op.op === 'u')
    return op.o2._id;
  else if (op.op === 'c')
    throw Error("Operator 'c' doesn't supply an object with id: " +
                EJSON.stringify(op));
  else
    throw Error("Unknown op: " + EJSON.stringify(op));
};
