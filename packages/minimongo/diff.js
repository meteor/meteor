// old_results: array of documents.
// new_results: array of documents.
// observer: object with 'added', 'changed', 'moved',
//           'removed' functions (each optional)
// deepcopy: if true, elements of new_results that are passed to callbacks are
//          deepcopied first
LocalCollection._diffQuery = function (old_results, new_results, observer, deepcopy) {

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

  // "maybe deepcopy"
  var mdc = (deepcopy ? LocalCollection._deepcopy : _.identity);

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
  // unmoved_set: the output of the algorithm; members of the LCS,
  // in the form of indices into new_results
  var unmoved_set = {};
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

  // pull out the LCS/LIS into unmoved_set
  var idx = (max_seq_len === 0 ? -1 : seq_ends[max_seq_len-1]);
  while (idx >= 0) {
    unmoved_set[idx] = true;
    idx = ptrs[idx];
  }

  //////// Main Diff Algorithm

  var old_idx = 0;
  var new_idx = 0;
  var bump_list = [];
  var bump_list_old_idx = [];
  var taken_list = [];

  var scan_to = function(old_j) {
    // old_j <= old_results.length (may scan to end)
    while (old_idx < old_j) {
      var old_doc = old_results[old_idx];
      var is_in_new = new_presence_of_id[old_doc._id];
      if (! is_in_new) {
        observer.removed && observer.removed(old_doc, new_idx + bump_list.length);
      } else {
        if (taken_list.length >= 1 && taken_list[0] === old_idx) {
          // already moved
          taken_list.shift();
        } else {
          // bump!
          bump_list.push(new_idx);
          bump_list_old_idx.push(old_idx);
        }
      }
      old_idx++;
    }
  };


  while (new_idx <= new_results.length) {
    if (new_idx < new_results.length) {
      var new_doc = new_results[new_idx];
      var old_doc_idx = old_index_of_id[new_doc._id];
      if (old_doc_idx === undefined) {
        // insert
        observer.added && observer.added(mdc(new_doc), new_idx + bump_list.length);
      } else {
        var old_doc = old_results[old_doc_idx];
        //var is_unmoved = (old_doc_idx > old_idx); // greedy; not minimal
        var is_unmoved = unmoved_set[new_idx];
        if (is_unmoved) {
          if (old_doc_idx < old_idx)
            Meteor._debug("Assertion failed while diffing: nonmonotonic lcs data");
          // no move
          scan_to(old_doc_idx);
          if (! _.isEqual(old_doc, new_doc)) {
            observer.changed && observer.changed(
              mdc(new_doc), new_idx + bump_list.length, old_doc);
          }
          old_idx++;
        } else {
          // move into place
          var to_idx = new_idx + bump_list.length;
          var from_idx;
          if (old_doc_idx >= old_idx) {
            // move backwards
            from_idx = to_idx + old_doc_idx - old_idx;
            // must take number of "taken" items into account; also use
            // results of this binary search to insert new taken_list entry
            var num_taken_before = _.sortedIndex(taken_list, old_doc_idx);
            from_idx -= num_taken_before;
            taken_list.splice(num_taken_before, 0, old_doc_idx);
          } else {
            // move forwards, from bump list
            // (binary search applies)
            var b = _.indexOf(bump_list_old_idx, old_doc_idx, true);
            if (b < 0)
              Meteor._debug("Assertion failed while diffing: no bumped item");
            from_idx = bump_list[b] + b;
            to_idx--;
            bump_list.splice(b, 1);
            bump_list_old_idx.splice(b, 1);
          }
          if (from_idx != to_idx)
            observer.moved && observer.moved(mdc(old_doc), from_idx, to_idx);
          if (! _.isEqual(old_doc, new_doc)) {
            observer.changed && observer.changed(mdc(new_doc), to_idx, old_doc);
          }
        }
      }
    } else {
      scan_to(old_results.length);
    }
    new_idx++;
  }
  if (bump_list.length > 0) {
    Meteor._debug(old_results);
    Meteor._debug(new_results);
    Meteor._debug("Assertion failed while diffing: leftover bump_list "+
                  bump_list);
  }

};
