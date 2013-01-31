
// ordered: bool.
// old_results and new_results: collections of documents.
//    if ordered, they are arrays.
//    if unordered, they are maps {_id: doc}.
// observer: object with 'added', 'changed', 'removed',
//           and (if ordered) 'moved' functions (each optional)
// deepcopy: if true, elements of new_results that are passed
//           to callbacks are deepcopied first.
LocalCollection._diffQueryChanges = function (ordered, oldResults, newResults,
                                       observer) {
  if (ordered)
    LocalCollection._diffQueryOrderedChanges(
      oldResults, newResults, observer);
  else
    LocalCollection._diffQueryUnorderedChanges(
      oldResults, newResults, observer);
};

LocalCollection._diffQueryUnorderedChanges = function (oldResults, newResults,
                                                observer) {
  if (observer.moved) {
    throw new Error("_diffQueryUnordered called with a moved observer!");
  }

  // "maybe deepcopy"
  _.each(newResults, function (newDoc) {
    if (_.has(oldResults, newDoc._id)) {
      var oldDoc = oldResults[newDoc._id];
      if (observer.changed && !EJSON.equals(oldDoc, newDoc)) {
        observer.changed(newDoc._id, LocalCollection._makeChangedFields(newDoc, oldDoc));
      }
    } else {
      var fields = EJSON.clone(newDoc);
      delete fields._id;
      observer.added && observer.added(newDoc._id, fields);
    }
  });

  if (observer.removed) {
    _.each(oldResults, function (oldDoc) {
      if (!_.has(newResults, oldDoc._id))
        observer.removed(oldDoc._id);
    });
  }
};


LocalCollection._diffQueryOrderedChanges = function (old_results, new_results, observer) {

  var new_presence_of_id = {};
  _.each(new_results, function (doc) {
    if (new_presence_of_id[doc._id])
      Meteor._debug("Duplicate _id in new_results");
    new_presence_of_id[doc._id] = true;
  });

  var old_index_of_id = {};
  _.each(old_results, function (doc, i) {
    if (doc._id in old_index_of_id)
      Meteor._debug("Duplicate _id in old_results");
    old_index_of_id[doc._id] = i;
  });

  // ALGORITHM:
  //
  // We walk old_idx through the old_results array and
  // new_idx through the new_results array at the same time.
  // These pointers establish a sort of correspondence between
  // old docs and new docs (identified by their _ids).
  // If they point to the same doc (i.e. old and new docs
  // with the same _id), we can increment both pointers
  // and fire no 'moved' callbacks.  Otherwise, we must
  // increment one or the other and fire approprate 'added',
  // 'removed', and 'moved' callbacks.
  //
  // The process is driven by new_results, in that we try
  // make the observer's array look like new_results by
  // establishing each new doc in order.  The doc pointed
  // to by new_idx is the one we are trying to establish
  // at any given time.  If it doesn't exist in old_results,
  // we fire an 'added' callback.  If it does, we have a
  // choice of two ways to handle the situation.  We can
  // advance old_idx forward to the corresponding old doc,
  // treating all intervening old docs as moved or removed,
  // and the current doc as unmoved.  Or, we can simply
  // establish the new doc as next by moving it into place,
  // i.e. firing a single 'moved' callback to move the
  // doc from wherever it was before.  Generating a sequence
  // of 'moved' callbacks that is not just correct but small
  // (or minimal) is a matter of choosing which elements
  // to consider moved and which ones merely change position
  // by virtue of the movement of other docs.
  //
  // Calling callbacks with correct indices requires understanding
  // what the observer's array looks like at each iteration.
  // The observer's array is a concatenation of:
  // - new_results up to (but not including) new_idx, with the
  //   addition of some "bumped" docs that we are later going
  //   to move into place
  // - old_results starting at old_idx, minus any docs that we
  //   have already moved ("taken" docs)
  //
  // To keep track of "bumped" items -- docs in the observer's
  // array that we have skipped over, but will be moved forward
  // later when we get to their new position -- we keep a
  // "bump list" of indices into new_results where bumped items
  // occur.  [The idea is that by adding an item to the list (bumping
  // it), we can consider it dealt with, even though it is still there.]
  // The corresponding position of new_idx in the observer's array,
  // then, is new_idx + bump_list.length, and the position of
  // the nth bumped item in the observer's array is
  // bump_list[n] + n (to account for the previous bumped items
  // that are still there).
  //
  // A "taken" list is used in a sort of analogous way to track
  // the indices of the documents after old_idx in old_results
  // that we have moved, so that, conversely, even though we will
  // come across them in old_results, they are actually no longer
  // in the observer's array.
  //
  // To determine which docs should be considered "moved" (and which
  // merely change position because of other docs moving) we run
  // a "longest common subsequence" (LCS) algorithm.  The LCS of the
  // old doc IDs and the new doc IDs gives the docs that should NOT be
  // considered moved.
  //
  // Overall, this diff implementation is asymptotically good, but could
  // be optimized to streamline execution and use less memory (e.g. not
  // have to build data structures with an entry for every doc).

  // Asymptotically: O(N k) where k is number of ops, or potentially
  // O(N log N) if inner loop of LCS were made to be binary search.


  //////// LCS (longest common sequence, with respect to _id)
  // (see Wikipedia article on Longest Increasing Subsequence,
  // where the LIS is taken of the sequence of old indices of the
  // docs in new_results)
  //
  // unmoved: the output of the algorithm; members of the LCS,
  // in the form of indices into new_results
  var unmoved = [];
  // max_seq_len: length of LCS found so far
  var max_seq_len = 0;
  // seq_ends[i]: the index into new_results of the last doc in a
  // common subsequence of length of i+1 <= max_seq_len
  var N = new_results.length;
  var seq_ends = new Array(N);
  // ptrs:  the common subsequence ending with new_results[n] extends
  // a common subsequence ending with new_results[ptr[n]], unless
  // ptr[n] is -1.
  var ptrs = new Array(N);
  // virtual sequence of old indices of new results
  var old_idx_seq = function(i_new) {
    return old_index_of_id[new_results[i_new]._id];
  };
  // for each item in new_results, use it to extend a common subsequence
  // of length j <= max_seq_len
  for(var i=0; i<N; i++) {
    if (old_index_of_id[new_results[i]._id] !== undefined) {
      var j = max_seq_len;
      // this inner loop would traditionally be a binary search,
      // but scanning backwards we will likely find a subseq to extend
      // pretty soon, bounded for example by the total number of ops.
      // If this were to be changed to a binary search, we'd still want
      // to scan backwards a bit as an optimization.
      while (j > 0) {
        if (old_idx_seq(seq_ends[j-1]) < old_idx_seq(i))
          break;
        j--;
      }

      ptrs[i] = (j === 0 ? -1 : seq_ends[j-1]);
      seq_ends[j] = i;
      if (j+1 > max_seq_len)
        max_seq_len = j+1;
    }
  }

  // pull out the LCS/LIS into unmoved
  var idx = (max_seq_len === 0 ? -1 : seq_ends[max_seq_len-1]);
  while (idx >= 0) {
    unmoved.push(idx);
    idx = ptrs[idx];
  }
  // the unmoved item list is built backwards, so fix that
  unmoved.reverse();

  // the last group is always anchored by the end of the result list, which is
  // an id of "null"
  unmoved.push(new_results.length);

  _.each(old_results, function (doc) {
    if (!new_presence_of_id[doc._id])
      observer.removed(doc._id);
  });
  // for each group of things in the new_results that is anchored by an unmoved
  // element, iterate through the things before it.
  var startOfGroup = 0;
  _.each(unmoved, function (endOfGroup) {
    var groupId = new_results[endOfGroup] ? new_results[endOfGroup]._id : null;
    var oldDoc;
    var newDoc;
    var fields;
    for (var i = startOfGroup; i < endOfGroup; i++) {
      newDoc = new_results[i];
      if (!_.has(old_index_of_id, newDoc._id)) {
        fields = EJSON.clone(newDoc);
        delete fields._id;
        observer.addedBefore(newDoc._id, fields, groupId);
      } else {
        // moved
        oldDoc = old_results[old_index_of_id[newDoc._id]];
        fields = LocalCollection._makeChangedFields(newDoc, oldDoc);
        if (!_.isEmpty(fields)) {
          observer.changed(newDoc._id, fields);
        }
        observer.movedBefore(newDoc._id, groupId);
      }
    }
    if (groupId) {
      newDoc = new_results[endOfGroup];
      oldDoc = old_results[old_index_of_id[newDoc._id]];
      fields = LocalCollection._makeChangedFields(newDoc, oldDoc);
      if (!_.isEmpty(fields)) {
        observer.changed(newDoc._id, fields);
      }
    }
    startOfGroup = endOfGroup+1;
  });


};


// General helper for diff-ing two objects.
// callbacks is an object like so:
// { leftOnly: function (key, leftValue) {...},
//   rightOnly: function (key, rightValue) {...},
//   both: function (key, leftValue, rightValue) {...},
// }
LocalCollection._diffObjects = function (left, right, callbacks) {
  _.each(left, function (leftValue, key) {
    if (_.has(right, key))
      callbacks.both && callbacks.both(key, leftValue, right[key]);
    else
      callbacks.leftOnly && callbacks.leftOnly(key, leftValue);
  });
  if (callbacks.rightOnly) {
    _.each(right, function(rightValue, key) {
      if (!_.has(left, key))
        callbacks.rightOnly(key, rightValue);
    });
  }
};
