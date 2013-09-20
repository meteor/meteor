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
  else
    throw Error("Unknown op: " + EJSON.stringify(op));
};

MongoConnection.prototype._observeChangesWithOplog = function (
  cursorDescription, callbacks) {
  var self = this;

  var phase = PHASE.INITIALIZING;

  var published = new IdMap;
  var selector = LocalCollection._compileSelector(cursorDescription.selector);

  // XXX eliminate "curious" name
  var curiousity = new IdMap;

  var add = function (doc) {
    var id = doc._id;
    var fields = EJSON.clone(doc);
    delete fields._id;
    published.set(id, fields);
    callbacks.added && callbacks.added(id, EJSON.clone(fields));
  };

  var remove = function (id) {
    published.remove(id);
    callbacks.removed && callbacks.removed(id);
  };

  // XXX mutates newDoc, that's weird
  var handleDoc = function (id, newDoc) {
    var matchesNow = newDoc && selector(newDoc);
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
      published.set(id, newDoc);
      if (callbacks.changed) {
        var changed = LocalCollection._makeChangedFields(
          EJSON.clone(newDoc), oldDoc);
        if (!_.isEmpty(changed))
          callbacks.changed(id, changed);
      }
    }
  };

  var beCurious = function () {
    phase = PHASE.FETCHING;
    while (!curiousity.isEmpty()) {
      if (phase !== PHASE.FETCHING)
        throw new Error("Surprising phase in beCurious: " + phase);

      var futures = [];
      var currentlyFetching = curiousity;
      curiousity = new IdMap;
      currentlyFetching.each(function (cacheKey, id) {
        // Run each until they yield. This implies that curiousity should not be
        // updated during this loop.
        Fiber(function () {
          var f = new Future;
          futures.push(f);
          var doc = self._docFetcher.fetch(cursorDescription.collectionName, id,
                                           cacheKey);
          handleDoc(id, doc);
          f.return();
        }).run();
      });
      Future.wait(futures);
      // Throw if any throw.
      // XXX this means the observe will now be stalled
      _.each(futures, function (f) {
        f.get();
      });
    }
    phase = PHASE.STEADY;
  };

  var oplogEntryHandlers = {};
  oplogEntryHandlers[PHASE.INITIALIZING] = function (op) {
    curiousity.set(idForOp(op), op.ts.toString());
  };
  oplogEntryHandlers[PHASE.FETCHING] = function (op) {
    // XXX we can probably actually handle some operations directly (eg,
    // insert/remove/replace if they don't conflict with "outstanding" fetches)
    curiousity.set(idForOp(op), op.ts.toString());
  };
  oplogEntryHandlers[PHASE.STEADY] = function (op) {
    var id = idForOp(op);
    if (op.op === 'd') {
      if (published.has(id))
        remove(id);
    } else if (op.op === 'i') {
      if (published.has(id))
        throw new Error("insert found for already-existing ID");

      // XXX what if selector yields?  for now it can't but later it could have
      // $where
      if (selector(op.o))
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
        // XXX this assumes no field filtering
        var newDoc = EJSON.clone(published.get(id));
        newDoc._id = id;
        LocalCollection._modify(newDoc, op.o);
        handleDoc(id, newDoc);
      } else {
        // XXX for not-currently-published docs, if we can guarantee the
        // irrelevance of the change, we can skip it
        curiousity.set(id, op.ts.toString());
        beCurious();
        return;
      }
    } else {
      throw Error("XXX SURPRISING OPERATION: " + op);
    }
  };


  var oplogHandle = self._oplogHandle.onOplogEntry(
    cursorDescription.collectionName, function (op) {
      oplogEntryHandlers[phase](op);
    }
  );

  // XXX ordering w.r.t. everything else?
  var listenersHandle = listenAll(
    cursorDescription, function (notification, complete) {
      // If we're not in a write fence, we don't have to do anything. That's
      // because
      var fence = DDPServer._CurrentWriteFence.get();
      if (!fence) {
        complete();
        return;
      }
      var write = fence.beginWrite();
      // XXX this also has to wait for steady!!!
      self._callWhenOplogProcessed(function () {
        write.committed();
      });
      complete();
    }
  );

  var initialCursor = new Cursor(self, cursorDescription);
  initialCursor.forEach(function (initialDoc) {
    add(initialDoc);
  });

  var catchUpFuture = new Future;
  self._callWhenOplogProcessed(catchUpFuture.resolver());
  catchUpFuture.wait();

  if (phase !== PHASE.INITIALIZING)
    throw Error("Phase unexpectedly " + phase);

  if (curiousity.isEmpty()) {
    phase = PHASE.STEADY;
  } else {
    phase = PHASE.FETCHING;
    Meteor.defer(beCurious);
  }

  return {
    stop: function () {
      listenersHandle.stop();
      oplogHandle.stop();
    }
  };
};
