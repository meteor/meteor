Tinytest.add("diff-sequence - diff changes ordering", function (test) {
  const makeDocs = function (ids) {
    return ids.map(function (id) {
      return { _id: id };
    });
  };
  const testMutation = function (a, b) {
    const aa = makeDocs(a);
    const bb = makeDocs(b);
    const aaCopy = EJSON.clone(aa);
    DiffSequence.diffQueryOrderedChanges(aa, bb, {
      addedBefore: function (id, doc, before) {
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
      movedBefore: function (id, before) {
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
      removed: function (id) {
        for (let i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === id) {
            aaCopy.splice(i, 1);
          }
        }
      },
    });
    test.equal(aaCopy, bb);
  };

  const testBothWays = function (a, b) {
    testMutation(a, b);
    testMutation(b, a);
  };

  testBothWays(["a", "b", "c"], ["c", "b", "a"]);
  testBothWays(["a", "b", "c"], []);
  testBothWays(["a", "b", "c"], ["e", "f"]);
  testBothWays(["a", "b", "c", "d"], ["c", "b", "a"]);
  testBothWays(
    ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    ["A", "B", "F", "G", "C", "D", "I", "L", "M", "N", "H"],
  );
  testBothWays(
    ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    ["A", "B", "C", "D", "F", "G", "H", "E", "I"],
  );
});

Tinytest.add("diff-sequence - diff", function (test) {
  // test correctness

  const diffTest = function (origLen, newOldIdx) {
    const oldResults = Array.from({ length: origLen });
    for (let i = 1; i <= origLen; i++) oldResults[i - 1] = { _id: i };

    const newResults = newOldIdx.map(function (n) {
      const doc = { _id: Math.abs(n) };
      if (n < 0) doc.changed = true;
      return doc;
    });
    const find = function (arr, id) {
      for (let i = 0; i < arr.length; i++) {
        if (EJSON.equals(arr[i]._id, id)) return i;
      }
      return -1;
    };

    const results = [...oldResults];
    const observer = {
      addedBefore: function (id, fields, before) {
        let before_idx;
        if (before === null) before_idx = results.length;
        else before_idx = find(results, before);
        const doc = Object.assign({ _id: id }, fields);
        test.isFalse(before_idx < 0 || before_idx > results.length);
        results.splice(before_idx, 0, doc);
      },
      removed: function (id) {
        const at_idx = find(results, id);
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        results.splice(at_idx, 1);
      },
      changed: function (id, fields) {
        const at_idx = find(results, id);
        const oldDoc = results[at_idx];
        const doc = EJSON.clone(oldDoc);
        DiffSequence.applyChanges(doc, fields);
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        test.equal(doc._id, oldDoc._id);
        results[at_idx] = doc;
      },
      movedBefore: function (id, before) {
        const old_idx = find(results, id);
        let new_idx;
        if (before === null) new_idx = results.length;
        else new_idx = find(results, before);
        if (new_idx > old_idx) new_idx--;
        test.isFalse(old_idx < 0 || old_idx >= results.length);
        test.isFalse(new_idx < 0 || new_idx >= results.length);
        results.splice(new_idx, 0, results.splice(old_idx, 1)[0]);
      },
    };

    DiffSequence.diffQueryOrderedChanges(oldResults, newResults, observer);
    test.equal(results, newResults);
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

Tinytest.add("diff-sequence - diffObjects partitions keys", (test) => {
  const left = { a: 1, b: 2, c: 3 };
  const right = { b: 2, c: 4, d: 5 };

  const leftOnly = [];
  const rightOnly = [];
  const both = [];

  DiffSequence.diffObjects(left, right, {
    leftOnly: (key, value) => leftOnly.push([key, value]),
    rightOnly: (key, value) => rightOnly.push([key, value]),
    both: (key, leftValue, rightValue) => both.push([key, leftValue, rightValue]),
  });

  test.equal(leftOnly, [["a", 1]]);
  test.equal(rightOnly, [["d", 5]]);
  // Sort `both` to make the test independent of Object.keys iteration order.
  both.sort((x, y) => x[0].localeCompare(y[0]));
  test.equal(both, [
    ["b", 2, 2],
    ["c", 3, 4],
  ]);
});

Tinytest.add("diff-sequence - diffObjects omits missing callbacks", (test) => {
  const left = { a: 1, b: 2 };
  const right = { b: 3, c: 4 };

  let bothCount = 0;
  // Only `both` is provided — leftOnly and rightOnly are absent and must not throw.
  DiffSequence.diffObjects(left, right, {
    both: () => {
      bothCount++;
    },
  });
  test.equal(bothCount, 1);
  test.ok(); // reaching here means no exception was thrown
});

Tinytest.add("diff-sequence - diffMaps partitions keys", (test) => {
  const left = new Map([
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);
  const right = new Map([
    ["b", 2],
    ["c", 4],
    ["d", 5],
  ]);

  const leftOnly = [];
  const rightOnly = [];
  const both = [];

  DiffSequence.diffMaps(left, right, {
    leftOnly: (key, value) => leftOnly.push([key, value]),
    rightOnly: (key, value) => rightOnly.push([key, value]),
    both: (key, leftValue, rightValue) => both.push([key, leftValue, rightValue]),
  });

  test.equal(leftOnly, [["a", 1]]);
  test.equal(rightOnly, [["d", 5]]);
  both.sort((x, y) => x[0].localeCompare(y[0]));
  test.equal(both, [
    ["b", 2, 2],
    ["c", 3, 4],
  ]);
});

Tinytest.add("diff-sequence - makeChangedFields detects adds, removes, changes", (test) => {
  const oldDoc = { a: 1, b: 2, c: 3 };
  const newDoc = { a: 1, b: 99, d: 4 };

  const changed = DiffSequence.makeChangedFields(newDoc, oldDoc);

  // 'a' unchanged, 'b' changed, 'c' removed (undefined), 'd' added.
  test.equal(changed, { b: 99, c: undefined, d: 4 });
});

Tinytest.add("diff-sequence - makeChangedFields uses EJSON.equals for deep compare", (test) => {
  const same = DiffSequence.makeChangedFields(
    { a: [1, 2, 3], b: { nested: true } },
    { a: [1, 2, 3], b: { nested: true } },
  );
  test.equal(same, {}, "deeply equal values should not produce a change");

  const changed = DiffSequence.makeChangedFields(
    { a: [1, 2, 4], b: { nested: true } },
    { a: [1, 2, 3], b: { nested: true } },
  );
  test.equal(changed, { a: [1, 2, 4] });
});

Tinytest.add("diff-sequence - applyChanges adds, replaces, removes fields", (test) => {
  const doc = { a: 1, b: 2 };
  DiffSequence.applyChanges(doc, { a: 99, c: 3, b: undefined });
  test.equal(doc, { a: 99, c: 3 });
});

Tinytest.add("diff-sequence - diffQueryUnorderedChanges detects added/removed/changed", (test) => {
  const oldResults = new IdMap();
  oldResults.set("x", { _id: "x", v: 1 });
  oldResults.set("y", { _id: "y", v: 2 });

  const newResults = new IdMap();
  newResults.set("y", { _id: "y", v: 99 });
  newResults.set("z", { _id: "z", v: 3 });

  const added = [];
  const removed = [];
  const changed = [];

  DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, {
    added: (id, fields) => added.push([id, fields]),
    removed: (id) => removed.push(id),
    changed: (id, fields) => changed.push([id, fields]),
  });

  test.equal(added, [["z", { v: 3 }]]);
  test.equal(removed, ["x"]);
  test.equal(changed, [["y", { v: 99 }]]);
});

Tinytest.add(
  "diff-sequence - diffQueryUnorderedChanges throws with a movedBefore observer",
  (test) => {
    const oldResults = new IdMap();
    const newResults = new IdMap();
    test.throws(
      () =>
        DiffSequence.diffQueryUnorderedChanges(oldResults, newResults, {
          movedBefore: () => {},
        }),
      /movedBefore/,
    );
  },
);

Tinytest.add("diff-sequence - diffQueryChanges dispatches based on ordered flag", (test) => {
  // Unordered path.
  const oldUnordered = new IdMap();
  oldUnordered.set("a", { _id: "a", v: 1 });
  const newUnordered = new IdMap();
  newUnordered.set("a", { _id: "a", v: 2 });

  const unorderedChanged = [];
  DiffSequence.diffQueryChanges(false, oldUnordered, newUnordered, {
    changed: (id, fields) => unorderedChanged.push([id, fields]),
  });
  test.equal(unorderedChanged, [["a", { v: 2 }]]);

  // Ordered path — uses addedBefore/movedBefore.
  const oldOrdered = [{ _id: "a", v: 1 }];
  const newOrdered = [
    { _id: "a", v: 1 },
    { _id: "b", v: 2 },
  ];

  const orderedAddedBefore = [];
  DiffSequence.diffQueryChanges(true, oldOrdered, newOrdered, {
    addedBefore: (id, fields, before) => orderedAddedBefore.push([id, fields, before]),
  });
  test.equal(orderedAddedBefore, [["b", { v: 2 }, null]]);
});

Tinytest.add("diff-sequence - projectionFn is applied before change detection", (test) => {
  const oldResults = new IdMap();
  oldResults.set("a", { _id: "a", visible: 1, hidden: 10 });

  const newResults = new IdMap();
  // Only the `hidden` field changed.
  newResults.set("a", { _id: "a", visible: 1, hidden: 999 });

  const changed = [];
  DiffSequence.diffQueryUnorderedChanges(
    oldResults,
    newResults,
    {
      changed: (id, fields) => changed.push([id, fields]),
    },
    {
      projectionFn: (doc) => ({ _id: doc._id, visible: doc.visible }),
    },
  );

  // The projection drops `hidden`, so no change is reported.
  test.equal(changed, []);
});
