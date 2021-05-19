import crypto from "crypto";

const hasOwn = Object.prototype.hasOwnProperty
/**
 * @description helper function to determine if the passed Object is empty
 * @param {Object} obj 
 * @returns Boolean
 */

function isObjEmpty(obj) {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
}

/**
 * @class DiffSequenceClass
 * @description old_results and new_results: collections of documents. if ordered, they are arrays. if unordered, they are IdMaps
 */

class DiffSequenceClass {
    constructor(){
      this._makeChangedFieldsCache = new Map();
    }

    diffQueryChanges(ordered, oldResults, newResults,
    observer, options){

    if (ordered)
    this.diffQueryOrderedChanges(
      oldResults, newResults, observer, options);
    else
    this.diffQueryUnorderedChanges(
      oldResults, newResults, observer, options);
  
    }

    diffQueryUnorderedChanges(oldResults, newResults, observer, options){
      options = options || {};
      var projectionFn = options.projectionFn || EJSON.clone;
    
      if (observer.movedBefore)
        throw new Error("_diffQueryUnordered called with a movedBefore observer!");
    
      newResults.forEach((newDoc, id) => {
        var oldDoc = oldResults.get(id);
        if (oldDoc) {
          if (observer.changed && !EJSON.equals(oldDoc, newDoc)) {
            var projectedNew = projectionFn(newDoc);
            var projectedOld = projectionFn(oldDoc);
            var changedFields =
                  DiffSequence.makeChangedFields(projectedNew, projectedOld);
            if (! isObjEmpty(changedFields)) {
              observer.changed(id, changedFields);
            }
          }
        } else if (observer.added) {
          var fields = projectionFn(newDoc);
          delete fields._id;
          observer.added(newDoc._id, fields);
        }
      });
    
      if (observer.removed)
        oldResults.forEach(function (oldDoc, id) {
          if (!newResults.has(id))
            observer.removed(id);
        });
    }

    diffQueryOrderedChanges(old_results, new_results,
    observer, options){
        options = options || {};
      var projectionFn = options.projectionFn || EJSON.clone;

      var new_presence_of_id = {};
      new_results.forEach(function (doc) {
        if (new_presence_of_id[doc._id])
          Meteor._debug("Duplicate _id in new_results");
        new_presence_of_id[doc._id] = true;
      });

      var old_index_of_id = {};
      old_results.forEach(function (doc, i) {
        if (doc._id in old_index_of_id)
          Meteor._debug("Duplicate _id in old_results");
        old_index_of_id[doc._id] = i;
      });

      // ALGORITHM:
      //
      // To determine which docs should be considered "moved" (and which
      // merely change position because of other docs moving) we run
      // a "longest common subsequence" (LCS) algorithm.  The LCS of the
      // old doc IDs and the new doc IDs gives the docs that should NOT be
      // considered moved.

      // To actually call the appropriate callbacks to get from the old state to the
      // new state:

      // First, we call removed() on all the items that only appear in the old
      // state.

      // Then, once we have the items that should not move, we walk through the new
      // results array group-by-group, where a "group" is a set of items that have
      // moved, anchored on the end by an item that should not move.  One by one, we
      // move each of those elements into place "before" the anchoring end-of-group
      // item, and fire changed events on them if necessary.  Then we fire a changed
      // event on the anchor, and move on to the next group.  There is always at
      // least one group; the last group is anchored by a virtual "null" id at the
      // end.

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
      var old_idx_seq = i_new => old_index_of_id[new_results[i_new]._id];
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

      old_results.forEach(function (doc) {
        if (!new_presence_of_id[doc._id])
          observer.removed && observer.removed(doc._id);
      });

      // for each group of things in the new_results that is anchored by an unmoved
      // element, iterate through the things before it.
      var startOfGroup = 0;
      unmoved.forEach((endOfGroup) => {
        var groupId = new_results[endOfGroup] ? new_results[endOfGroup]._id : null;
        var oldDoc, newDoc, fields, projectedNew, projectedOld;
        for (var i = startOfGroup; i < endOfGroup; i++) {
          newDoc = new_results[i];
          if (!hasOwn.call(old_index_of_id, newDoc._id)) {
            fields = projectionFn(newDoc);
            delete fields._id;
            observer.addedBefore && observer.addedBefore(newDoc._id, fields, groupId);
            observer.added && observer.added(newDoc._id, fields);
          } else {
            // moved
            oldDoc = old_results[old_index_of_id[newDoc._id]];
            projectedNew = projectionFn(newDoc);
            projectedOld = projectionFn(oldDoc);
            fields = DiffSequence.makeChangedFields(projectedNew, projectedOld);
            if (!isObjEmpty(fields)) {
              observer.changed && observer.changed(newDoc._id, fields);
            }
            observer.movedBefore && observer.movedBefore(newDoc._id, groupId);
          }
        }
        if (groupId) {
          newDoc = new_results[endOfGroup];
          oldDoc = old_results[old_index_of_id[newDoc._id]];
          projectedNew = projectionFn(newDoc);
          projectedOld = projectionFn(oldDoc);
          fields = DiffSequence.makeChangedFields(projectedNew, projectedOld);
          if (!isObjEmpty(fields)) {
            observer.changed && observer.changed(newDoc._id, fields);
          }
        }
        startOfGroup = endOfGroup+1;
      });
    }

    diffObjects(left, right, callbacks){
      Object.keys(left).forEach(key => {
        const leftValue = left[key];
        if (hasOwn.call(right, key))
          callbacks.both && callbacks.both(key, leftValue, right[key]);
        else
          callbacks.leftOnly && callbacks.leftOnly(key, leftValue);
      });

      if (callbacks.rightOnly)
        Object.keys(right).forEach(key => {
          const rightValue = right[key];
          if (! hasOwn.call(left, key)) {
            callbacks.rightOnly(key, rightValue);
          }
        });
    }

    diffMaps(left, right, callbacks){
      left.forEach(function (leftValue, key) {
        if (right.has(key))
          callbacks.both && callbacks.both(key, leftValue, right.get(key));
        else
          callbacks.leftOnly && callbacks.leftOnly(key, leftValue);
      });
      if (callbacks.rightOnly)
        right.forEach(function (rightValue, key) {
          if (!left.has(key)){
            callbacks.rightOnly(key, rightValue);
          }
        });
    }

    makeChangedFields(newDoc, oldDoc){
      const getHash = this._generateHashFromArray([newDoc, oldDoc]);
      if(this._makeChangedFieldsCache.has(getHash)){
        return this._makeChangedFieldsCache.get(getHash)
      }
      else {
        const fields = new Map();
        this.diffObjects(oldDoc, newDoc, {
          leftOnly: function (key, value) {
            fields.set(key, undefined)
          },
          rightOnly: function (key, value) {
            fields.set(key, value);
          },
          both: function (key, leftValue, rightValue) {
            if (!EJSON.equals(leftValue, rightValue))
              fields.set(key, rightValue);
          }
        });
        const newObject = Object.fromEntries(fields)
        this._memoize("_makeChangedFieldsCache", getHash, newObject)
        return newObject; 
      }
    }

    applyChanges(doc, changeFields){
      Object.keys(changeFields).forEach(key => {
        const value = changeFields[key];
        if (typeof value === "undefined")
          delete doc[key];
        else 
          doc[key] = value;
      });
    }

    _memoize(cacheStore, key, value){
      this[cacheStore].size > 25 && this[cacheStore].clear(); 
      this[cacheStore].set(key, value);
    }

    _generateHashFromArray(array){
      let objectString = "";
      for(let object in array){
        objectString.concat(EJSON.stringify(object));
      }

      return crypto.createHash('md5').update(objectString).digest('hex');
    }

}

export const DiffSequence = new DiffSequenceClass;