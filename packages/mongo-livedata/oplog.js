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

  var beCurious = function () {
    throw Error("I AM CURIOUS")
  };

  var oplogEntryHandlers = {};
  oplogEntryHandlers[PHASE.INITIALIZING] = function (op) {
    curiousity.set(idForOp(op), op.ts.toString());
  };
  oplogEntryHandlers[PHASE.FETCHING] = function (op) {
    // XXX now
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
      var isModifier = _.has(op.o, '$set') || _.has(op.o, '$unset');

      if (isModifier) {
        curiousity.set(id, op.ts.toString());
        phase = PHASE.FETCHING;
        beCurious();
        return;
      }

      var newDoc = _.extend({_id: id}, op.o);
      var matchesNow = selector(newDoc);
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
          var changed = LocalCollection._makeChangedFields(newDoc, oldDoc);
          if (!_.isEmpty(changed))
            callbacks.changed(id, changed);
        }
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
