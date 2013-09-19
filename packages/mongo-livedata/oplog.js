MongoConnection.prototype._observeChangesWithOplog = function (
  cursorDescription, callbacks) {
  var self = this;

  // XXX let's do this with race conditions first!
  //
  // the real way will involve special oplog handling during the initial cursor
  // read. specifically:
  //
  // 1) start reading the oplog. for every document that could conceivably be
  // relevant, cache a bit of information about what we saw.  (eg, cache
  // document for inserts, removal fact for removes, "needs poll" for updates.
  // most recent overrides.)
  //
  // 2) read the initial set and send added messages.
  //
  // 3) write a sentinel to some field.
  //
  // 4) wait until that sentinel comes up through the oplog.
  //
  // 5) use the cached information (compared to what we already know) to send
  //    messages about things that changed right about then
  //
  // 6) now that we're in the "steady state", process ops more directly

  // XXX NOW: replace idSet/changedFields with simply currently published
  // results, ok??? that should simplify things, and allow the implementation of
  // "replace" (noodles)

  // XXX DOC: map id -> currently published fields
  //          (which of course is also the same as what is tracked in merge box,
  //           ah well)
  var published = new IdMap;

  var selector = LocalCollection._compileSelector(cursorDescription.selector);

  // XXX add mutates its argument, which could get confusing
  var add = function (doc) {
    var id = doc._id;
    delete doc._id;
    published.set(id, doc);
    callbacks.added && callbacks.added(id, doc);
  };

  var remove = function (id) {
    published.remove(id);
    callbacks.removed && callbacks.removed(id);
  };

  // XXX the ordering here is wrong
  var initialCursor = new Cursor(self, cursorDescription);
  initialCursor.forEach(function (initialDoc) {
    add(initialDoc);
  });

  var oplogHandle = self._oplogHandle.onOplogEntry(cursorDescription.collectionName, function (op) {
    var id;
    if (op.op === 'd') {
      // XXX check that ObjectId works here
      id = op.o._id;
      if (published.has(id))
        remove(id);

      // XXX this needs to cancel any in-progress "ID lookup" for the document
    } else if (op.op === 'i') {
      id = op.o._id;
      if (published.has(id))
        throw new Error("insert found for already-existing ID");

      // XXX what if selector yields?  for now it can't but later it could have
      // $where
      if (selector(op.o)) {
        add(op.o);
      }
    } else if (op.op === 'u') {
      id = op.o2._id;

      // Is this a modifier ($set/$unset, which may require us to poll the
      // database to figure out if the whole document matches the selector) or a
      // replacement (in which case we can just directly re-evaluate the
      // selector)?
      var isModifier = _.has(op.o, '$set') || _.has(op.o, '$unset');

      var newDoc;
      if (isModifier) {
        // XXX problem is, the result of this findOne is delivered at a random
        // time, not necessarily synced with other stuff that may be coming down
        // the oplog. also, we shouldn't read fields that aren't
        // necessary to evaluate selector or to publish.
        newDoc = self._docFetcher.fetch(cursorDescription.collectionName, id,
                                        op.ts.toString());
      } else {
        newDoc = _.extend({_id: id}, op.o);
      }

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
          var changed = LocalCollection._makeChangedFields(newDoc, oldDoc);
          if (!_.isEmpty(changed)) {
            callbacks.changed(id, changed);
          }
        }
      }
    } else {
      console.log("SURPRISING FOR NOW OPERATION (eg drop collection)", op);
    }
  });

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

  var observeHandle = {
    stop: function () {
      listenersHandle.stop();
      oplogHandle.stop();
    }
  };
  return observeHandle;
};
