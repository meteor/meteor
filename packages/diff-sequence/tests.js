Tinytest.add("diff-sequence - review own prototype change notifications", function (test) {
  var original = JSON.parse('{"__proto__":{"value":1},"ordinary":1}');
  var updated = JSON.parse('{"__proto__":{"value":42},"ordinary":1}');
  [
    [{ordinary: 1}, original, {value: 1}],
    [original, updated, {value: 42}],
    [updated, {ordinary: 1}, undefined]
  ].forEach(function (entry) {
    var changes = DiffSequence.makeChangedFields(entry[1], entry[0]);
    test.isTrue(Object.prototype.hasOwnProperty.call(changes, '__proto__'));
    test.equal(changes.__proto__, entry[2]);
    test.equal(Object.getPrototypeOf(changes), Object.prototype);
    test.isFalse(Object.prototype.hasOwnProperty.call(changes, 'ordinary'));
  });
});

Tinytest.add("diff-sequence - review apply keeps prototype unchanged", function (test) {
  [{}, Object.create(null)].forEach(function (doc) {
    var prototype = Object.getPrototypeOf(doc);
    DiffSequence.applyChanges(doc, JSON.parse('{"__proto__":{"owner":"nested"},"ordinary":2}'));
    test.equal(Object.getPrototypeOf(doc), prototype);
    test.isTrue(Object.prototype.hasOwnProperty.call(doc, '__proto__'));
    test.equal(doc.__proto__.owner, 'nested');
    test.isUndefined(doc.owner);
    test.equal(doc.ordinary, 2);
    var cleared = {};
    Object.defineProperty(cleared, '__proto__', {value: undefined, enumerable: true});
    DiffSequence.applyChanges(doc, cleared);
    test.isFalse(Object.prototype.hasOwnProperty.call(doc, '__proto__'));
    test.equal(Object.getPrototypeOf(doc), prototype);
    test.equal(doc.ordinary, 2);
  });
});

Tinytest.add("diff-sequence - diff changes ordering", function (test) {
  var makeDocs = function (ids) {
    return ids.map(function (id) { return {_id: id};});
  };
  var testMutation = function (a, b) {
    var aa = makeDocs(a);
    var bb = makeDocs(b);
    var aaCopy = EJSON.clone(aa);
    DiffSequence.diffQueryOrderedChanges(aa, bb, {

      addedBefore: function (id, doc, before) {
        if (before === null) {
          aaCopy.push( Object.assign({_id: id}, doc));
          return;
        }
        for (var i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === before) {
            aaCopy.splice(i, 0, Object.assign({_id: id}, doc));
            return;
          }
        }
      },
      movedBefore: function (id, before) {
        var found;
        for (var i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === id) {
            found = aaCopy[i];
            aaCopy.splice(i, 1);
          }
        }
        if (before === null) {
          aaCopy.push( Object.assign({_id: id}, found));
          return;
        }
        for (i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === before) {
            aaCopy.splice(i, 0, Object.assign({_id: id}, found));
            return;
          }
        }
      },
      removed: function (id) {
        var found;
        for (var i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === id) {
            found = aaCopy[i];
            aaCopy.splice(i, 1);
          }
        }
      }
    });
    test.equal(aaCopy, bb);
  };

  var testBothWays = function (a, b) {
    testMutation(a, b);
    testMutation(b, a);
  };

  testBothWays(["a", "b", "c"], ["c", "b", "a"]);
  testBothWays(["a", "b", "c"], []);
  testBothWays(["a", "b", "c"], ["e","f"]);
  testBothWays(["a", "b", "c", "d"], ["c", "b", "a"]);
  testBothWays(['A','B','C','D','E','F','G','H','I'],
               ['A','B','F','G','C','D','I','L','M','N','H']);
  testBothWays(['A','B','C','D','E','F','G','H','I'],['A','B','C','D','F','G','H','E','I']);
});

Tinytest.add("diff-sequence - diff", function (test) {

  // test correctness

  var diffTest = function(origLen, newOldIdx) {
    var oldResults = new Array(origLen);
    for (var i = 1; i <= origLen; i++)
      oldResults[i-1] = {_id: i};

    var newResults = newOldIdx.map(function(n) {
      var doc = {_id: Math.abs(n)};
      if (n < 0)
        doc.changed = true;
      return doc;
    });
    var find = function (arr, id) {
      for (var i = 0; i < arr.length; i++) {
        if (EJSON.equals(arr[i]._id, id))
          return i;
      }
      return -1;
    };

    var results = [...oldResults];
    var observer = {
      addedBefore: function(id, fields, before) {
        var before_idx;
        if (before === null)
          before_idx = results.length;
        else
          before_idx = find (results, before);
        var doc = Object.assign({_id: id}, fields);
        test.isFalse(before_idx < 0 || before_idx > results.length);
        results.splice(before_idx, 0, doc);
      },
      removed: function(id) {
        var at_idx = find (results, id);
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        results.splice(at_idx, 1);
      },
      changed: function(id, fields) {
        var at_idx = find (results, id);
        var oldDoc = results[at_idx];
        var doc = EJSON.clone(oldDoc);
        DiffSequence.applyChanges(doc, fields);
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        test.equal(doc._id, oldDoc._id);
        results[at_idx] = doc;
      },
      movedBefore: function(id, before) {
        var old_idx = find(results, id);
        var new_idx;
        if (before === null)
          new_idx = results.length;
        else
          new_idx = find (results, before);
        if (new_idx > old_idx)
          new_idx--;
        test.isFalse(old_idx < 0 || old_idx >= results.length);
        test.isFalse(new_idx < 0 || new_idx >= results.length);
        results.splice(new_idx, 0, results.splice(old_idx, 1)[0]);
      }
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
