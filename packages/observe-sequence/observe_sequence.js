var warn = function () {
  if (ObserveSequence._suppressWarnings) {
    ObserveSequence._suppressWarnings--;
  } else {
    if (typeof console !== 'undefined' && console.warn)
      console.warn.apply(console, arguments);

    ObserveSequence._loggedWarnings++;
  }
};

var idStringify = LocalCollection._idStringify;
var idParse = LocalCollection._idParse;

ObserveSequence = {
  _suppressWarnings: 0,
  _loggedWarnings: 0,

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

    // 'lastSeqArray' contains the previous value of the sequence
    // we're observing. It is an array of objects with '_id' and
    // 'item' fields.  'item' is the element in the array, or the
    // document in the cursor.
    //
    // '_id' is whichever of the following is relevant, unless it has
    // already appeared -- in which case it's randomly generated.
    //
    // * if 'item' is an object:
    //   * an '_id' field, if present
    //   * otherwise, the index in the array
    //
    // * if 'item' is a number or string, use that value
    //
    // XXX this can be generalized by allowing {{#each}} to accept a
    // general 'key' argument which could be a function, a dotted
    // field name, or the special @index value.
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
          var idsUsed = {};
          seqArray = _.map(seq, function (item, index) {
            if (typeof item === 'string') {
              // ensure not empty, since other layers (eg DomRange) assume this as well
              id = "-" + item;
            } else if (typeof item === 'number' ||
                       typeof item === 'boolean' ||
                       item === undefined) {
              id = item;
            } else if (typeof item === 'object') {
              id = (item && item._id) || index;
            } else {
              throw new Error("{{#each}} doesn't support arrays with " +
                              "elements of type " + typeof item);
            }

            var idString = idStringify(id);
            if (idsUsed[idString]) {
              warn("duplicate id " + id + " in", seq);
              id = Random.id();
            } else {
              idsUsed[idString] = true;
            }

            return { _id: id, item: item };
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
                  throw new Error("Expected initial data from observe in order");
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
          throw badSequenceError();
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
      throw badSequenceError();
    }
  }
};

var badSequenceError = function () {
  return new Error("{{#each}} currently only accepts " +
                   "arrays, cursors or falsey values.");
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
  var posOld = {}; // maps from idStringify'd ids
  var posNew = {}; // ditto

  _.each(seqArray, function (doc, i) {
    newIdObjects.push(_.pick(doc, '_id'));
    posNew[idStringify(doc._id)] = i;
  });
  _.each(lastSeqArray, function (doc, i) {
    oldIdObjects.push(_.pick(doc, '_id'));
    posOld[idStringify(doc._id)] = i;
  });

  // Arrays can contain arbitrary objects. We don't diff the
  // objects. Instead we always fire 'changed' callback on every
  // object. The consumer of `observe-sequence` should deal with
  // it appropriately.
  diffFn(oldIdObjects, newIdObjects, {
    addedBefore: function (id, doc, before) {
        callbacks.addedAt(
          id,
          seqArray[posNew[idStringify(id)]].item,
          posNew[idStringify(id)],
          before);
    },
    movedBefore: function (id, before) {
        callbacks.movedTo(
          id,
          seqArray[posNew[idStringify(id)]].item,
          posOld[idStringify(id)],
          posNew[idStringify(id)],
          before);
    },
    removed: function (id) {
        callbacks.removed(
          id,
          lastSeqArray[posOld[idStringify(id)]].item);
    }
  });

  _.each(posNew, function (pos, idString) {
    var id = idParse(idString);
    if (_.has(posOld, idString)) {
      // specifically for primitive types, compare equality before
      // firing the changed callback. otherwise, always fire it
      // because doing a deep EJSON comparison is not guaranteed to
      // work (an array can contain arbitrary objects, and 'transform'
      // can be used on cursors). also, deep diffing is not
      // necessarily the most efficient (if only a specific subfield
      // of the object is later accessed).
      var newItem = seqArray[pos].item;
      var oldItem = lastSeqArray[posOld[idString]].item;

      if (typeof newItem === 'object' || newItem !== oldItem)
          callbacks.changed(id, newItem, oldItem);
      }
  });
};
