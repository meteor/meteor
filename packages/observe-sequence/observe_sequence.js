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
    // Structure of lastSeqArray is a string id and item field containing all
    // the data attached to that id.
    // We need to carry out id in a wrapper object because we can't rely there
    // is always an '_id' field on the document and document can be a string
    // (attaching new properties to a string instance is not a good idea).
    var lastSeqArray = [];
    var computation = Deps.autorun(function () {
      var seq = sequenceFunc();
      var seqArray;

      var isMinimongoCursor = function (seq) {
        var minimongo = Package.minimongo;
        return !!minimongo && (seq instanceof minimongo.LocalCollection.Cursor);
      };

      var replaceArray = function () {
        // XXX we assume every element has a unique '_id' field
        var diffFn = Package.minimongo.LocalCollection._diffQueryOrderedChanges;
        // XXX after invert the values are stringified indexes
        var posOld = _.invert(_.pluck(lastSeqArray, '_id'));
        var posNew = _.invert(_.pluck(seqArray, '_id'));

        // Notice that we don't specify 'changed' callback, which means we don't
        // want diff algo to find changes in documents. It's not always possible
        // to do so: algo doesn't know how to compare not EJSONable objects.
        diffFn(lastSeqArray, seqArray, {
          addedBefore: function (id, doc, before) {
            callbacks.addedAt(id, doc.item, +posNew[id], before);
          },
          movedBefore: function (id, before) {
            callbacks.movedTo(id, seqArray[posNew[id]].item, +posOld[id], +posNew[id], before);
          },
          removed: function (id) {
            callbacks.removed(id, lastSeqArray[posOld[id]].item);
          }
        });

        // Mark every object whose id suvived this transition. Since we don't
        // diff documents, we can't say what changed and what not, so report
        // everything.
        _.each(posNew, function (pos, id) {
          if (_.has(posOld, id))
            callbacks.changed(id, lastSeqArray[posOld[id]].item, seqArray[pos].item);
        });
      };

      Deps.nonreactive(function () {
        if (isMinimongoCursor(lastSeq)) {
          lastSeq.rewind();
          lastSeqArray = _.map(lastSeq.fetch(), function (doc) {
            return {_id: doc._id, item: doc};
          });
          lastSeq.rewind();
        }
      });

      if (!seq) {
        seqArray = [];
        replaceArray();
      } else if (seq instanceof Array) {
        // XXX if id is not set, we just set it to the index in array
        seqArray = _.map(seq, function (doc, i) {
          return { _id: doc._id || Random.id(), item: doc };
        });
        replaceArray();
      } else if (isMinimongoCursor(seq)) {
        var cursor = seq;
        if (lastSeq !== cursor) { // fresh cursor.
          Deps.nonreactive(function () {
            cursor.rewind();
            seqArray = _.map(cursor.fetch(), function (doc) {
              return {_id: doc._id, item: doc};
            });
            cursor.rewind();
          });

          replaceArray();

          // fetch all elements and start observing.
          var initial = true;
          if (activeObserveHandle) {
            activeObserveHandle.stop();
          }

          activeObserveHandle = cursor.observe({
            addedAt: function (document, atIndex, before) {
              if (!initial)
                callbacks.addedAt(document._id, document, atIndex, before);
            },
            changed: function (newDocument, oldDocument) {
              callbacks.changed(newDocument._id, newDocument, oldDocument);
            },
            removed: function (oldDocument) {
              callbacks.removed(oldDocument._id, oldDocument);
            },
            movedTo: function (document, fromIndex, toIndex, before) {
              callbacks.movedTo(document._id, document, fromIndex, toIndex, before);
            }
          });
          initial = false;
        }
      } else {
        throw new Error("Not a recognized sequence type. Currently only arrays, cursors or "
                        + "falsey values accepted.");
      }

      lastSeq = seq;
      lastSeqArray = seqArray;
    });

    return {
      stop: function () {
        computation.stop();
      }
    };
  }
};
