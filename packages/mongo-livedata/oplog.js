var Fiber = Npm.require('fibers');
var Future = Npm.require('fibers/future');

var PHASE = {
  INITIALIZING: 1,
  FETCHING: 2,
  STEADY: 3
};

var idForOp = function (op) {
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

observeChangesWithOplog = function (cursorDescription,
                                    mongoHandle,
                                    multiplexer) {
  var stopped = false;

  Package.facts && Package.facts.Facts.incrementServerFact(
    "mongo-livedata", "oplog-observers", 1);

  var phase = PHASE.INITIALIZING;

  var published = new LocalCollection._IdMap;
  var selector = cursorDescription.selector;
  var selectorFn = LocalCollection._compileSelector(selector);
  var projection = cursorDescription.options.fields || {};
  var projectionFn = LocalCollection._compileProjection(projection);
  // Projection function, result of combining important fields for selector and
  // existing fields projection
  var sharedProjection = LocalCollection._combineSelectorAndProjection(selector, projection);
  var sharedProjectionFn = LocalCollection._compileProjection(sharedProjection);

  var needToFetch = new LocalCollection._IdMap;
  var currentlyFetching = new LocalCollection._IdMap;

  var add = function (doc) {
    var id = doc._id;
    var fields = _.clone(doc);
    delete fields._id;
    if (published.has(id))
      throw Error("tried to add something already published " + id);
    published.set(id, sharedProjectionFn(fields));
    multiplexer.added(id, projectionFn(fields));
  };

  var remove = function (id) {
    if (!published.has(id))
      throw Error("tried to remove something unpublished " + id);
    published.remove(id);
    multiplexer.removed(id);
  };

  var handleDoc = function (id, newDoc) {
    newDoc = _.clone(newDoc);
    var matchesNow = newDoc && selectorFn(newDoc);
    var matchedBefore = published.has(id);
    if (matchesNow && !matchedBefore) {
      add(newDoc);
    } else if (matchedBefore && !matchesNow) {
      remove(id);
    } else if (matchesNow) {
      var oldDoc = published.get(id);
      if (!oldDoc)
        throw Error("thought that " + id + " was there!");
      delete newDoc._id;
      published.set(id, sharedProjectionFn(newDoc));
      var changed = LocalCollection._makeChangedFields(
        _.clone(newDoc), oldDoc);
      changed = projectionFn(changed);
      if (!_.isEmpty(changed))
        multiplexer.changed(id, changed);
    }
  };

  var fetchModifiedDocuments = function () {
    phase = PHASE.FETCHING;
    while (!stopped && !needToFetch.empty()) {
      if (phase !== PHASE.FETCHING)
        throw new Error("Surprising phase in fetchModifiedDocuments: " + phase);

      currentlyFetching = needToFetch;
      needToFetch = new LocalCollection._IdMap;
      var waiting = 0;
      var error = null;
      var fut = new Future;
      Fiber(function () {
        currentlyFetching.forEach(function (cacheKey, id) {
          // currentlyFetching will not be updated during this loop.
          waiting++;
          mongoHandle._docFetcher.fetch(cursorDescription.collectionName, id, cacheKey, function (err, doc) {
            if (err) {
              if (!error)
                error = err;
            } else if (!stopped) {
              handleDoc(id, doc);
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
      currentlyFetching = new LocalCollection._IdMap;
    }
    beSteady();
  };

  var writesToCommitWhenWeReachSteady = [];
  var beSteady = function () {
    phase = PHASE.STEADY;
    var writes = writesToCommitWhenWeReachSteady;
    writesToCommitWhenWeReachSteady = [];
    _.each(writes, function (w) {
      w.committed();
    });
  };

  var oplogEntryHandlers = {};
  oplogEntryHandlers[PHASE.INITIALIZING] = function (op) {
    needToFetch.set(idForOp(op), op.ts.toString());
  };
  // We can use the same handler for STEADY and FETCHING; the main difference is
  // that FETCHING has non-empty currentlyFetching and/or needToFetch.
  oplogEntryHandlers[PHASE.STEADY] = function (op) {
    var id = idForOp(op);
    // If we're already fetching this one, or about to, we can't optimize; make
    // sure that we fetch it again if necessary.
    if (currentlyFetching.has(id) || needToFetch.has(id)) {
      if (phase !== PHASE.FETCHING)
        throw Error("map not empty during steady phase");
      needToFetch.set(id, op.ts.toString());
      return;
    }

    if (op.op === 'd') {
      if (published.has(id))
        remove(id);
    } else if (op.op === 'i') {
      if (published.has(id))
        throw new Error("insert found for already-existing ID");

      // XXX what if selector yields?  for now it can't but later it could have
      // $where
      if (selectorFn(op.o))
        add(op.o);
    } else if (op.op === 'u') {
      // Is this a modifier ($set/$unset, which may require us to poll the
      // database to figure out if the whole document matches the selector) or a
      // replacement (in which case we can just directly re-evaluate the
      // selector)?
      var isReplace = !_.has(op.o, '$set') && !_.has(op.o, '$unset');

      if (isReplace) {
        handleDoc(id, _.extend({_id: id}, op.o));
      } else if (published.has(id)) {
        // Oh great, we actually know what the document is, so we can apply
        // this directly.
        var newDoc = EJSON.clone(published.get(id));
        newDoc._id = id;
        LocalCollection._modify(newDoc, op.o);
        handleDoc(id, sharedProjectionFn(newDoc));
      } else if (LocalCollection._isSelectorAffectedByModifier(
          cursorDescription.selector, op.o)) {
        // XXX _isSelectorAffectedByModifier should actually be
        // _canModifierChangeSelectorToTrue.  because {x: 9} is affected by
        // {$set: {x: 7}} but not in a way that is relevant here, because either
        // x was already 9 (and this was handled by the previous clause), or x
        // was not 9 and this isn't going to affect the selector
        needToFetch.set(id, op.ts.toString());
        if (phase === PHASE.STEADY)
          fetchModifiedDocuments();
        return;
      }
    } else {
      throw Error("XXX SURPRISING OPERATION: " + op);
    }
  };
  oplogEntryHandlers[PHASE.FETCHING] = oplogEntryHandlers[PHASE.STEADY];


  var oplogEntryHandle = mongoHandle._oplogHandle.onOplogEntry(
    cursorDescription.collectionName, function (op) {
      if (op.op === 'c') {
        published.forEach(function (fields, id) {
          remove(id);
        });
      } else {
        // All other operators should be handled depending on phase
        oplogEntryHandlers[phase](op);
      }
    }
  );

  // XXX ordering w.r.t. everything else?
  var listenersHandle = listenAll(
    cursorDescription, function (notification, complete) {
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
      mongoHandle._oplogHandle.waitUntilCaughtUp();
      // Make sure that all of the callbacks have made it through the
      // multiplexer and been delivered to ObserveHandles before committing
      // writes.
      multiplexer.onFlush(function (){
        if (stopped || phase === PHASE.STEADY) {
          write.committed();
        } else {
          writesToCommitWhenWeReachSteady.push(write);
        }
      });
    }
  );

  // observeChangesWithOplog cannot yield (because the manipulation of
  // mongoHandle._observeMultiplexers needs to be yield-free); calling
  // multiplexer.ready() is the equivalent of the observeChanges "synchronous"
  // return.
  Meteor.defer(function () {
    if (stopped)
      throw new Error("oplog stopped surprisingly early");

    var initialCursor = new Cursor(mongoHandle, cursorDescription);
    initialCursor.forEach(function (initialDoc) {
      add(initialDoc);
    });
    if (stopped)
      throw new Error("oplog stopped quite early");
    // Actually send out the initial adds to the ObserveHandles.
    multiplexer.ready();

    if (stopped)
      return;
    mongoHandle._oplogHandle.waitUntilCaughtUp();

    if (stopped)
      return;
    if (phase !== PHASE.INITIALIZING)
      throw Error("Phase unexpectedly " + phase);

    if (needToFetch.empty()) {
      beSteady();
    } else {
      fetchModifiedDocuments();
    }
  });

  return {
    // This stop function is invoked from the onStop of the ObserveMultiplexer,
    // so it shouldn't actually be possible to call it until the multiplexer is
    // ready.
    stop: function () {
      if (stopped)
        return;
      stopped = true;
      listenersHandle.stop();
      oplogEntryHandle.stop();

      published = null;
      selector = null;
      needToFetch = null;
      currentlyFetching = null;

      _.each(writesToCommitWhenWeReachSteady, function (w) {
        w.committed();
      });
      writesToCommitWhenWeReachSteady = null;

      oplogEntryHandle = null;
      listenersHandle = null;

      Package.facts && Package.facts.Facts.incrementServerFact(
        "mongo-livedata", "oplog-observers", -1);
    }
  };
};
