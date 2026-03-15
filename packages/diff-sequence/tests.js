import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('diff-sequence', () => {
  it('diff changes ordering', () => {
    const makeDocs = (ids) => ids.map((id) => ({ _id: id }));

    const testMutation = (a, b) => {
      const aa = makeDocs(a);
      const bb = makeDocs(b);
      const aaCopy = EJSON.clone(aa);
      DiffSequence.diffQueryOrderedChanges(aa, bb, {
        addedBefore(id, doc, before) {
          if (before === null) {
            aaCopy.push(Object.assign({ _id: id }, doc));
            return;
          }
          for (let i = 0; i < aaCopy.length; i++) {
            if (aaCopy[i]._id === before) {
              aaCopy.splice(i, 0, Object.assign({ _id: id }, doc));
              return;
            }
          }
        },
        movedBefore(id, before) {
          let found;
          for (let i = 0; i < aaCopy.length; i++) {
            if (aaCopy[i]._id === id) {
              found = aaCopy[i];
              aaCopy.splice(i, 1);
            }
          }
          if (before === null) {
            aaCopy.push(Object.assign({ _id: id }, found));
            return;
          }
          for (let i = 0; i < aaCopy.length; i++) {
            if (aaCopy[i]._id === before) {
              aaCopy.splice(i, 0, Object.assign({ _id: id }, found));
              return;
            }
          }
        },
        removed(id) {
          for (let i = 0; i < aaCopy.length; i++) {
            if (aaCopy[i]._id === id) {
              aaCopy.splice(i, 1);
            }
          }
        }
      });
      assert.deepStrictEqual(aaCopy, bb);
    };

    const testBothWays = (a, b) => {
      testMutation(a, b);
      testMutation(b, a);
    };

    testBothWays(["a", "b", "c"], ["c", "b", "a"]);
    testBothWays(["a", "b", "c"], []);
    testBothWays(["a", "b", "c"], ["e", "f"]);
    testBothWays(["a", "b", "c", "d"], ["c", "b", "a"]);
    testBothWays(['A','B','C','D','E','F','G','H','I'],
                 ['A','B','F','G','C','D','I','L','M','N','H']);
    testBothWays(['A','B','C','D','E','F','G','H','I'],
                 ['A','B','C','D','F','G','H','E','I']);
  });

  it('diff', () => {
    const diffTest = (origLen, newOldIdx) => {
      const oldResults = new Array(origLen);
      for (let i = 1; i <= origLen; i++)
        oldResults[i - 1] = { _id: i };

      const newResults = newOldIdx.map((n) => {
        const doc = { _id: Math.abs(n) };
        if (n < 0) doc.changed = true;
        return doc;
      });

      const find = (arr, id) => {
        for (let i = 0; i < arr.length; i++) {
          if (EJSON.equals(arr[i]._id, id)) return i;
        }
        return -1;
      };

      const results = [...oldResults];
      const observer = {
        addedBefore(id, fields, before) {
          let before_idx;
          if (before === null)
            before_idx = results.length;
          else
            before_idx = find(results, before);
          const doc = Object.assign({ _id: id }, fields);
          assert.ok(!(before_idx < 0 || before_idx > results.length));
          results.splice(before_idx, 0, doc);
        },
        removed(id) {
          const at_idx = find(results, id);
          assert.ok(!(at_idx < 0 || at_idx >= results.length));
          results.splice(at_idx, 1);
        },
        changed(id, fields) {
          const at_idx = find(results, id);
          const oldDoc = results[at_idx];
          const doc = EJSON.clone(oldDoc);
          DiffSequence.applyChanges(doc, fields);
          assert.ok(!(at_idx < 0 || at_idx >= results.length));
          assert.deepStrictEqual(doc._id, oldDoc._id);
          results[at_idx] = doc;
        },
        movedBefore(id, before) {
          const old_idx = find(results, id);
          let new_idx;
          if (before === null)
            new_idx = results.length;
          else
            new_idx = find(results, before);
          if (new_idx > old_idx) new_idx--;
          assert.ok(!(old_idx < 0 || old_idx >= results.length));
          assert.ok(!(new_idx < 0 || new_idx >= results.length));
          results.splice(new_idx, 0, results.splice(old_idx, 1)[0]);
        }
      };

      DiffSequence.diffQueryOrderedChanges(oldResults, newResults, observer);
      assert.deepStrictEqual(results, newResults);
    };

    // edge cases and cases run into during debugging
    diffTest(5, [5, 1, 2, 3, 4]);
    diffTest(0, [1, 2, 3, 4]);
    diffTest(4, []);
    diffTest(7, [4, 5, 6, 7, 1, 2, 3]);
    diffTest(7, [5, 6, 7, 1, 2, 3, 4]);
    diffTest(10, [7, 4, 11, 6, 12, 1, 5]);
    diffTest(3, [3, 2, 1]);
    diffTest(10, [2, 7, 4, 6, 11, 3, 8, 9]);
    diffTest(0, []);
    diffTest(1, []);
    diffTest(0, [1]);
    diffTest(1, [1]);
    diffTest(5, [1, 2, 3, 4, 5]);

    // interaction between "changed" and other ops
    diffTest(5, [-5, -1, 2, -3, 4]);
    diffTest(7, [-4, -5, 6, 7, -1, 2, 3]);
    diffTest(7, [5, 6, -7, 1, 2, -3, 4]);
    diffTest(10, [7, -4, 11, 6, 12, -1, 5]);
    diffTest(3, [-3, -2, -1]);
    diffTest(10, [-2, 7, 4, 6, 11, -3, -8, 9]);
  });
});
