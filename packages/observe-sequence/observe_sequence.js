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
    var lastSeqArray = [];
    var computation = Deps.autorun(function () {
      var seq = sequenceFunc();
      var seqArray;

      var isMinimongoCursor = function (seq) {
        var minimongo = Package.minimongo;
        return !!minimongo && (seq instanceof minimongo.LocalCollection.Cursor);
      };

      var naivelyReplaceArray = function () {
        //_.each(lastSeqArray, function (idAndItem) {
        //  callbacks.removed(idAndItem.id, idAndItem.item);
        //});
        //_.each(seqArray, function (idAndItem, index) {
        //  callbacks.addedAt(idAndItem.id, idAndItem.item, index, null);
        //});
        //return;
        _.each(lastSeqArray, function (item) {
          if (!item._id)
            console.log(item)
          callbacks.removed(item._id, item);
        });
        _.each(seqArray, function (item, index) {
          if (!item._id)
            console.log(item)
          callbacks.addedAt(item._id, item, index, null);
        });
        return;
        // XXX we assume every element has a unique '_id' field
        var diffFn = Package.minimongo.LocalCollection._diffQueryOrderedChanges;
        var posOld = _.invert(_.pluck(lastSeqArray, '_id'));
        var posNew = _.invert(_.pluck(seqArray, '_id'));

        //console.log(lastSeqArray, seqArray)
        diffFn(lastSeqArray, seqArray, {
          addedBefore: function (id, doc, before) {
            //console.log('addedBefore ', id, doc, posNew[id], before);
            callbacks.addedAt(id, doc, posNew[id], before);
          },
          movedBefore: function (id, before) {
            //console.log('moved before ', arguments);
            callbacks.movedTo(id, seqArray[posNew[id]], posOld[id], posNew[id], before);
          },
          changed: function (id, doc) {
            //console.log('changed ', id, lastSeqArray[posOld[id]], doc);
            callbacks.changed(id, lastSeqArray[posOld[id]], doc);
          },
          removed: function (id) {
            //console.log('removed ', id, lastSeqArray[posOld[id]]);
            callbacks.removed(id, lastSeqArray[posOld[id]]);
          }
        });
      };

      if (!seq) {
        seqArray = [];
        naivelyReplaceArray();
      } else if (seq instanceof Array) {
        // XXX if id is not set, we just set it to the index in array
        seqArray = _.map(seq, function (doc, i) {
          return _.extend({ _id: i.toString() }, doc);
        });
        //seqArray = _.map(seq, function (doc, i) {
        //  return { id: doc._id || i, item: doc };
        //});
        naivelyReplaceArray();
      } else if (isMinimongoCursor(seq)) {
        var cursor = seq;
        if (lastSeq !== cursor) { // fresh cursor.
          Deps.nonreactive(function () {
            seqArray = cursor.fetch();
            //seqArray = _.map(cursor.fetch(), function (doc) {
            //  return {id: doc._id, item: doc};
            //});
          });
          naivelyReplaceArray();

          // fetch all elements and start observing.
          var initial = true;
          if (activeObserveHandle) {
            activeObserveHandle.stop();
          }

          activeObserveHandle = cursor.observe({
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

          // XXX this is wrong! we also need to keep track of changes
          // to the cursor so that if we switch to an array or another
          // cursor we diff against the right original value of `seqArray`.
          // write a test for this and fix it.
          Deps.nonreactive(function () {
            seqArray = cursor.fetch();
            //seqArray = _.map(cursor.fetch(), function (item) {
            //  return {id: item._id, item: item};
            //});
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
