ObserveSequence = {
  // A mechanism similar to cursor.observe which receives a reactive
  // function returning a sequence type and firing appropriate callbacks
  // when the value changes.
  //
  // @param sequenceFunc {Function} a reactive function returning a
  //     sequence type. The currently supported sequence types are:
  //     'null', arrays and cursors.
  //
  // @param callbacks {Object} similar to a specific subset of
  //     callbacks passed to `cursor.observe`
  //     (http://docs.meteor.com/#observe), with minor variations to
  //     support the fact that not all sequences contain objects with
  //     _id fields.  Specifically:
  //
  //     * addedAt(id, item, atIndex, beforeId)
  //     * changed(id, newItem, oldItem)
  //     * removed(id, oldItem)
  //     * movedTo(id, item, fromIndex, toIndex, beforeId)
  //
  // @returns {Object(stop: Function)} call 'stop' on the return value
  //     to stop observing this sequence function.
  //
  // We don't make any assumptions about our ability to compare sequence
  // elements (ie, we don't assume EJSON.equals works; maybe there is extra
  // state/random methods on the objects) so unlike cursor.observe, we may
  // sometimes call changed() when nothing actually changed.
  // XXX consider if we *can* make the stronger assumption and avoid
  //     no-op changed calls (in some cases?)
  //
  // XXX currently only supports the callbacks used by our
  // implementation of {{#each}}, but this can be expanded.
  //
  // XXX #each doesn't use the indices (though we'll eventually need
  // a way to get them when we support `@index`), but calling
  // `cursor.observe` causes the index to be calculated on every
  // callback using a linear scan (unless you turn it off by passing
  // `_no_indices`).  Any way to avoid calculating indices on a pure
  // cursor observe like we used to?
  observe: function (sequenceFunc, callbacks) {
    var lastSeq = null;
    var activeObserveHandle = null;

    // `lastSeqArray` contains the previous value of the sequence
    // we're observing. It is an array of objects with `_id` and
    // `item` fields.  `item` is the element in the array, or the
    // document in the cursor.  `_id` is set from `item._id` if
    // available (and must be unique), or generated uniquely
    // otherwise.
    var lastSeqArray = []; // elements are objects of form {_id, item}
    var computation = Deps.autorun(function () {
      var seq = sequenceFunc();

      Deps.nonreactive(function () {
        var seqArray; // same structure as `lastSeqArray` above.

        // If we were previously observing a cursor, replace lastSeqArray with
        // more up-to-date information (specifically, the state of the observe
        // before it was stopped, which may be older than the DB).
        if (activeObserveHandle) {
          lastSeqArray = _.map(activeObserveHandle._fetch(), function (doc) {
            return {_id: doc._id, item: doc};
          });
          activeObserveHandle.stop();
          activeObserveHandle = null;
        }

        if (!seq) {
          seqArray = [];
          diffArray(lastSeqArray, seqArray, callbacks);
        } else if (seq instanceof Array) {
          // XXX if id is not set, we just set it randomly for now.  We
          // can do better so that diffing the arrays ["A", "B"] and
          // ["A"] doesn't cause "A" to be removed.
          seqArray = _.map(seq, function (doc, i) {
            return { _id: (doc && doc._id) || Random.id(), item: doc };
          });
          diffArray(lastSeqArray, seqArray, callbacks);
        } else if (isMinimongoCursor(seq)) {
          var cursor = seq;
          seqArray = [];

          var initial = true; // are we observing initial data from cursor?
          activeObserveHandle = cursor.observe({
            addedAt: function (document, atIndex, before) {
              if (initial) {
                // keep track of initial data so that we can diff once
                // we exit `observe`.
                if (before !== null)
                  throw new Error("Initial data from cursor.observe didn't arrive in order");
                seqArray.push({ _id: document._id, item: document });
              } else {
                callbacks.addedAt(document._id, document, atIndex, before);
              }
            },
            changed: function (newDocument, oldDocument) {
              callbacks.changed(newDocument._id, newDocument, oldDocument);
            },
            removed: function (oldDocument) {
              callbacks.removed(oldDocument._id, oldDocument);
            },
            movedTo: function (document, fromIndex, toIndex, before) {
              callbacks.movedTo(
                document._id, document, fromIndex, toIndex, before);
            }
          });
          initial = false;

          // diff the old sequnce with initial data in the new cursor. this will
          // fire `addedAt` callbacks on the initial data.
          diffArray(lastSeqArray, seqArray, callbacks);

        } else {
          throw new Error("Not a recognized sequence type. Currently only " +
                          "arrays, cursors or falsey values accepted.");
        }

        lastSeq = seq;
        lastSeqArray = seqArray;
      });
    });

    return {
      stop: function () {
        computation.stop();
        if (activeObserveHandle)
          activeObserveHandle.stop();
      }
    };
  },

  // Fetch the items of `seq` into an array, where `seq` is of one of the
  // sequence types accepted by `observe`.  If `seq` is a cursor, a
  // dependency is established.
  fetch: function (seq) {
    if (!seq) {
      return [];
    } else if (seq instanceof Array) {
      return seq;
    } else if (isMinimongoCursor(seq)) {
      return seq.fetch();
    } else {
      throw new Error("Not a recognized sequence type. Currently only " +
                      "arrays, cursors or falsey values accepted.");
    }
  }
};

var isMinimongoCursor = function (seq) {
  var minimongo = Package.minimongo;
  return !!minimongo && (seq instanceof minimongo.LocalCollection.Cursor);
};

// Calculates the differences between `lastSeqArray` and
// `seqArray` and calls appropriate functions from `callbacks`.
// Reuses Minimongo's diff algorithm implementation.
var diffArray = function (lastSeqArray, seqArray, callbacks) {
  var diffFn = Package.minimongo.LocalCollection._diffQueryOrderedChanges;
  var oldIdObjects = [];
  var newIdObjects = [];
  var posOld = {};
  var posNew = {};

  _.each(seqArray, function (doc, i) {
    newIdObjects.push(_.pick(doc, '_id'));
    posNew[doc._id] = i;
  });
  _.each(lastSeqArray, function (doc, i) {
    oldIdObjects.push(_.pick(doc, '_id'));
    posOld[doc._id] = i;
  });

  // Arrays can contain arbitrary objects. We don't diff the
  // objects. Instead we always fire 'changed' callback on every
  // object. The consumer of `observe-sequence` should deal with
  // it appropriately.
  diffFn(oldIdObjects, newIdObjects, {
    addedBefore: function (id, doc, before) {
      callbacks.addedAt(id, seqArray[posNew[id]].item, posNew[id], before);
    },
    movedBefore: function (id, before) {
      callbacks.movedTo(id, seqArray[posNew[id]].item, posOld[id], posNew[id], before);
    },
    removed: function (id) {
      callbacks.removed(id, lastSeqArray[posOld[id]].item);
    }
  });

  _.each(posNew, function (pos, id) {
    if (_.has(posOld, id))
      callbacks.changed(id, seqArray[pos].item, lastSeqArray[posOld[id]].item);
  });
};
