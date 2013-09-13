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
  // XXX the current implementation doesn't do any intelligent array
  // diffing. Instead, it clears and repopulates the sequence by
  // firing a sequence of calls to 'removed' followed by 'addedAt'.
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
    var lastSeqArray = []; // elements are objects of form {id, item}
    var computation = Deps.autorun(function () {
      var seq = sequenceFunc();
      var seqArray;

      var naivelyReplaceArray = function () {
        _.each(lastSeqArray, function (idAndItem) {
          callbacks.removed(idAndItem.id, idAndItem.item);
        });
        _.each(seqArray, function (idAndItem, index) {
          callbacks.addedAt(idAndItem.id, idAndItem.item, index, null);
        });
      };

      if (!seq) {
        seqArray = [];
        naivelyReplaceArray();

      } else if (seq instanceof Array) {
        seqArray = _.map(seq, function (item) {
          var id = item._id || Random.id();
          return {id: id, item: item};
        });
        naivelyReplaceArray();

      } else if (seq._publishCursor) { // XXX is there a better way to
                                       // check if 'seq' is a cursor?
        if (lastSeq !== seq) { // fresh cursor.
          naivelyReplaceArray();

          // fetch all elements and start observing.
          var initial = true;
          if (activeObserveHandle) {
            activeObserveHandle.stop();
          }

          activeObserveHandle = seq.observe({
            addedAt: function (document, atIndex, before) {
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

          Deps.nonreactive(function () {
            seqArray = _.map(seq.fetch(), function (item) {
              return {id: item._id, item: item};
            });
          });
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
