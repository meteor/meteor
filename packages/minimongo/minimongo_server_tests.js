Tinytest.add("minimongo - modifier affects selector", function (test) {
  function testSelectorPaths (sel, paths, desc) {
    var matcher = new Minimongo.Matcher(sel);
    test.equal(matcher._getPaths(), paths, desc);
  }

  testSelectorPaths({
    foo: {
      bar: 3,
      baz: 42
    }
  }, ['foo'], "literal");

  testSelectorPaths({
    foo: 42,
    bar: 33
  }, ['foo', 'bar'], "literal");

  testSelectorPaths({
    foo: [ 'something' ],
    bar: "asdf"
  }, ['foo', 'bar'], "literal");

  testSelectorPaths({
    a: { $lt: 3 },
    b: "you know, literal",
    'path.is.complicated': { $not: { $regex: 'acme.*corp' } }
  }, ['a', 'b', 'path.is.complicated'], "literal + operators");

  testSelectorPaths({
    $or: [{ 'a.b': 1 }, { 'a.b.c': { $lt: 22 } },
     {$and: [{ 'x.d': { $ne: 5, $gte: 433 } }, { 'a.b': 234 }]}]
  }, ['a.b', 'a.b.c', 'x.d'], 'group operators + duplicates');

  // When top-level value is an object, it is treated as a literal,
  // so when you query col.find({ a: { foo: 1, bar: 2 } })
  // it doesn't mean you are looking for anything that has 'a.foo' to be 1 and
  // 'a.bar' to be 2, instead you are looking for 'a' to be exatly that object
  // with exatly that order of keys. { a: { foo: 1, bar: 2, baz: 3 } } wouldn't
  // match it. That's why in this selector 'a' would be important key, not a.foo
  // and a.bar.
  testSelectorPaths({
    a: {
      foo: 1,
      bar: 2
    },
    'b.c': {
      literal: "object",
      but: "we still observe any changes in 'b.c'"
    }
  }, ['a', 'b.c'], "literal object");

  // Note that a and b do NOT end up in the path list, but x and y both do.
  testSelectorPaths({
    $or: [
      {x: {$elemMatch: {a: 5}}},
      {y: {$elemMatch: {b: 7}}}
    ]
  }, ['x', 'y'], "$or and elemMatch");

  function testSelectorAffectedByModifier (sel, mod, yes, desc) {
    var matcher = new Minimongo.Matcher(sel);
    test.equal(matcher.affectedByModifier(mod), yes, desc);
  }

  function affected(sel, mod, desc) {
    testSelectorAffectedByModifier(sel, mod, true, desc);
  }
  function notAffected(sel, mod, desc) {
    testSelectorAffectedByModifier(sel, mod, false, desc);
  }

  notAffected({ foo: 0 }, { $set: { bar: 1 } }, "simplest");
  affected({ foo: 0 }, { $set: { foo: 1 } }, "simplest");
  affected({ foo: 0 }, { $set: { 'foo.bar': 1 } }, "simplest");
  notAffected({ 'foo.bar': 0 }, { $set: { 'foo.baz': 1 } }, "simplest");
  affected({ 'foo.bar': 0 }, { $set: { 'foo.1': 1 } }, "simplest");
  affected({ 'foo.bar': 0 }, { $set: { 'foo.2.bar': 1 } }, "simplest");

  notAffected({ 'foo': 0 }, { $set: { 'foobaz': 1 } }, "correct prefix check");
  notAffected({ 'foobar': 0 }, { $unset: { 'foo': 1 } }, "correct prefix check");
  notAffected({ 'foo.bar': 0 }, { $unset: { 'foob': 1 } }, "correct prefix check");

  notAffected({ 'foo.Infinity.x': 0 }, { $unset: { 'foo.x': 1 } }, "we convert integer fields correctly");
  notAffected({ 'foo.1e3.x': 0 }, { $unset: { 'foo.x': 1 } }, "we convert integer fields correctly");

  affected({ 'foo.3.bar': 0 }, { $set: { 'foo.3.bar': 1 } }, "observe for an array element");

  notAffected({ 'foo.4.bar.baz': 0 }, { $unset: { 'foo.3.bar': 1 } }, "delicate work with numeric fields in selector");
  notAffected({ 'foo.4.bar.baz': 0 }, { $unset: { 'foo.bar': 1 } }, "delicate work with numeric fields in selector");
  affected({ 'foo.4.bar.baz': 0 }, { $unset: { 'foo.4.bar': 1 } }, "delicate work with numeric fields in selector");
  affected({ 'foo.bar.baz': 0 }, { $unset: { 'foo.3.bar': 1 } }, "delicate work with numeric fields in selector");

  affected({ 'foo.0.bar': 0 }, { $set: { 'foo.0.0.bar': 1 } }, "delicate work with nested arrays and selectors by indecies");

  affected({foo: {$elemMatch: {bar: 5}}}, {$set: {'foo.4.bar': 5}}, "$elemMatch");
});

Tinytest.add("minimongo - selector and projection combination", function (test) {
  function testSelProjectionComb (sel, proj, expected, desc) {
    var matcher = new Minimongo.Matcher(sel);
    test.equal(matcher.combineIntoProjection(proj), expected, desc);
  }

  // Test with inclusive projection
  testSelProjectionComb({ a: 1, b: 2 }, { b: 1, c: 1, d: 1 }, { a: true, b: true, c: true, d: true }, "simplest incl");
  testSelProjectionComb({ $or: [{ a: 1234, e: {$lt: 5} }], b: 2 }, { b: 1, c: 1, d: 1 }, { a: true, b: true, c: true, d: true, e: true }, "simplest incl, branching");
  testSelProjectionComb({
    'a.b': { $lt: 3 },
    'y.0': -1,
    'a.c': 15
  }, {
    'd': 1,
    'z': 1
  }, {
    'a.b': true,
    'y': true,
    'a.c': true,
    'd': true,
    'z': true
  }, "multikey paths in selector - incl");

  testSelProjectionComb({
    foo: 1234,
    $and: [{ k: -1 }, { $or: [{ b: 15 }] }]
  }, {
    'foo.bar': 1,
    'foo.zzz': 1,
    'b.asdf': 1
  }, {
    foo: true,
    b: true,
    k: true
  }, "multikey paths in fields - incl");

  testSelProjectionComb({
    'a.b.c': 123,
    'a.b.d': 321,
    'b.c.0': 111,
    'a.e': 12345
  }, {
    'a.b.z': 1,
    'a.b.d.g': 1,
    'c.c.c': 1
  }, {
    'a.b.c': true,
    'a.b.d': true,
    'a.b.z': true,
    'b.c': true,
    'a.e': true,
    'c.c.c': true
  }, "multikey both paths - incl");

  testSelProjectionComb({
    'a.b.c.d': 123,
    'a.b1.c.d': 421,
    'a.b.c.e': 111
  }, {
    'a.b': 1
  }, {
    'a.b': true,
    'a.b1.c.d': true
  }, "shadowing one another - incl");

  testSelProjectionComb({
    'a.b': 123,
    'foo.bar': false
  }, {
    'a.b.c.d': 1,
    'foo': 1
  }, {
    'a.b': true,
    'foo': true
  }, "shadowing one another - incl");

  testSelProjectionComb({
    'a.b.c': 1
  }, {
    'a.b.c': 1
  }, {
    'a.b.c': true
  }, "same paths - incl");

  testSelProjectionComb({
    'x.4.y': 42,
    'z.0.1': 33
  }, {
    'x.x': 1
  }, {
    'x.x': true,
    'x.y': true,
    'z': true
  }, "numbered keys in selector - incl");

  testSelProjectionComb({
    'a.b.c': 42,
    $where: function () { return true; }
  }, {
    'a.b': 1,
    'z.z': 1
  }, {}, "$where in the selector - incl");

  testSelProjectionComb({
    $or: [
      {'a.b.c': 42},
      {$where: function () { return true; } }
    ]
  }, {
    'a.b': 1,
    'z.z': 1
  }, {}, "$where in the selector - incl");

  // Test with exclusive projection
  testSelProjectionComb({ a: 1, b: 2 }, { b: 0, c: 0, d: 0 }, { c: false, d: false }, "simplest excl");
  testSelProjectionComb({ $or: [{ a: 1234, e: {$lt: 5} }], b: 2 }, { b: 0, c: 0, d: 0 }, { c: false, d: false }, "simplest excl, branching");
  testSelProjectionComb({
    'a.b': { $lt: 3 },
    'y.0': -1,
    'a.c': 15
  }, {
    'd': 0,
    'z': 0
  }, {
    d: false,
    z: false
  }, "multikey paths in selector - excl");

  testSelProjectionComb({
    foo: 1234,
    $and: [{ k: -1 }, { $or: [{ b: 15 }] }]
  }, {
    'foo.bar': 0,
    'foo.zzz': 0,
    'b.asdf': 0
  }, {
  }, "multikey paths in fields - excl");

  testSelProjectionComb({
    'a.b.c': 123,
    'a.b.d': 321,
    'b.c.0': 111,
    'a.e': 12345
  }, {
    'a.b.z': 0,
    'a.b.d.g': 0,
    'c.c.c': 0
  }, {
    'a.b.z': false,
    'c.c.c': false
  }, "multikey both paths - excl");

  testSelProjectionComb({
    'a.b.c.d': 123,
    'a.b1.c.d': 421,
    'a.b.c.e': 111
  }, {
    'a.b': 0
  }, {
  }, "shadowing one another - excl");

  testSelProjectionComb({
    'a.b': 123,
    'foo.bar': false
  }, {
    'a.b.c.d': 0,
    'foo': 0
  }, {
  }, "shadowing one another - excl");

  testSelProjectionComb({
    'a.b.c': 1
  }, {
    'a.b.c': 0
  }, {
  }, "same paths - excl");

  testSelProjectionComb({
    'a.b': 123,
    'a.c.d': 222,
    'ddd': 123
  }, {
    'a.b': 0,
    'a.c.e': 0,
    'asdf': 0
  }, {
    'a.c.e': false,
    'asdf': false
  }, "intercept the selector path - excl");

  testSelProjectionComb({
    'a.b.c': 14
  }, {
    'a.b.d': 0
  }, {
    'a.b.d': false
  }, "different branches - excl");

  testSelProjectionComb({
    'a.b.c.d': "124",
    'foo.bar.baz.que': "some value"
  }, {
    'a.b.c.d.e': 0,
    'foo.bar': 0
  }, {
  }, "excl on incl paths - excl");

  testSelProjectionComb({
    'x.4.y': 42,
    'z.0.1': 33
  }, {
    'x.x': 0,
    'x.y': 0
  }, {
    'x.x': false,
  }, "numbered keys in selector - excl");

  testSelProjectionComb({
    'a.b.c': 42,
    $where: function () { return true; }
  }, {
    'a.b': 0,
    'z.z': 0
  }, {}, "$where in the selector - excl");

  testSelProjectionComb({
    $or: [
      {'a.b.c': 42},
      {$where: function () { return true; } }
    ]
  }, {
    'a.b': 0,
    'z.z': 0
  }, {}, "$where in the selector - excl");

});

Tinytest.add("minimongo - sorter and projection combination", function (test) {
  function testSorterProjectionComb (sortSpec, proj, expected, desc) {
    var sorter = new Minimongo.Sorter(sortSpec);
    test.equal(sorter.combineIntoProjection(proj), expected, desc);
  }

  // Test with inclusive projection
  testSorterProjectionComb({ a: 1, b: 1 }, { b: 1, c: 1, d: 1 }, { a: true, b: true, c: true, d: true }, "simplest incl");
  testSorterProjectionComb({ a: 1, b: -1 }, { b: 1, c: 1, d: 1 }, { a: true, b: true, c: true, d: true }, "simplest incl");
  testSorterProjectionComb({ 'a.c': 1 }, { b: 1 }, { 'a.c': true, b: true }, "dot path incl");
  testSorterProjectionComb({ 'a.1.c': 1 }, { b: 1 }, { 'a.c': true, b: true }, "dot num path incl");
  testSorterProjectionComb({ 'a.1.c': 1 }, { b: 1, a: 1 }, { a: true, b: true }, "dot num path incl overlap");
  testSorterProjectionComb({ 'a.1.c': 1, 'a.2.b': -1 }, { b: 1 }, { 'a.c': true, 'a.b': true, b: true }, "dot num path incl");
  testSorterProjectionComb({ 'a.1.c': 1, 'a.2.b': -1 }, {}, {}, "dot num path with empty incl");

  // Test with exclusive projection
  testSorterProjectionComb({ a: 1, b: 1 }, { b: 0, c: 0, d: 0 }, { c: false, d: false }, "simplest excl");
  testSorterProjectionComb({ a: 1, b: -1 }, { b: 0, c: 0, d: 0 }, { c: false, d: false }, "simplest excl");
  testSorterProjectionComb({ 'a.c': 1 }, { b: 0 }, { b: false }, "dot path excl");
  testSorterProjectionComb({ 'a.1.c': 1 }, { b: 0 }, { b: false }, "dot num path excl");
  testSorterProjectionComb({ 'a.1.c': 1 }, { b: 0, a: 0 }, { b: false }, "dot num path excl overlap");
  testSorterProjectionComb({ 'a.1.c': 1, 'a.2.b': -1 }, { b: 0 }, { b: false }, "dot num path excl");
});


(function () {
  // TODO: Tests for "can selector become true by modifier" are incomplete,
  // absent or test the functionality of "not ideal" implementation (test checks
  // that certain case always returns true as implementation is incomplete)
  // - tests with $and/$or/$nor/$not branches (are absent)
  // - more tests with arrays fields and numeric keys (incomplete and test "not
  // ideal" implementation)
  // - tests when numeric keys actually mean numeric keys, not array indexes
  // (are absent)
  // - tests with $-operators in the selector (are incomplete and test "not
  // ideal" implementation)
  //  * gives up on $-operators with non-scalar values ({$ne: {x: 1}})
  //  * analyses $in
  //  * analyses $nin/$ne
  //  * analyses $gt, $gte, $lt, $lte
  //  * gives up on a combination of $gt/$gte/$lt/$lte and $ne/$nin
  //  * doesn't support $eq properly

  var test = null; // set this global in the beginning of every test
  // T - should return true
  // F - should return false
  var oneTest = function (sel, mod, expected, desc) {
    var matcher = new Minimongo.Matcher(sel);
    test.equal(matcher.canBecomeTrueByModifier(mod), expected, desc);
  };
  function T (sel, mod, desc) {
    oneTest(sel, mod, true, desc);
  }
  function F (sel, mod, desc) {
    oneTest(sel, mod, false, desc);
  }

  Tinytest.add("minimongo - can selector become true by modifier - literals (structured tests)", function (t) {
    test = t;

    var selector = {
      'a.b.c': 2,
      'foo.bar': {
        z: { y: 1 }
      },
      'foo.baz': [ {ans: 42}, "string", false, undefined ],
      'empty.field': null
    };

    T(selector, {$set:{ 'a.b.c': 2 }});
    F(selector, {$unset:{ 'a': 1 }});
    F(selector, {$unset:{ 'a.b': 1 }});
    F(selector, {$unset:{ 'a.b.c': 1 }});
    T(selector, {$set:{ 'a.b': { c: 2 } }});
    F(selector, {$set:{ 'a.b': {} }});
    T(selector, {$set:{ 'a.b': { c: 2, x: 5 } }});
    F(selector, {$set:{ 'a.b.c.k': 3 }});
    F(selector, {$set:{ 'a.b.c.k': {} }});

    F(selector, {$unset:{ 'foo': 1 }});
    F(selector, {$unset:{ 'foo.bar': 1 }});
    F(selector, {$unset:{ 'foo.bar.z': 1 }});
    F(selector, {$unset:{ 'foo.bar.z.y': 1 }});
    F(selector, {$set:{ 'foo.bar.x': 1 }});
    F(selector, {$set:{ 'foo.bar': {} }});
    F(selector, {$set:{ 'foo.bar': 3 }});
    T(selector, {$set:{ 'foo.bar': { z: { y: 1 } } }});
    T(selector, {$set:{ 'foo.bar.z': { y: 1 } }});
    T(selector, {$set:{ 'foo.bar.z.y': 1 }});

    F(selector, {$set:{ 'empty.field': {} }});
    T(selector, {$set:{ 'empty': {} }});
    T(selector, {$set:{ 'empty.field': null }});
    T(selector, {$set:{ 'empty.field': undefined }});
    F(selector, {$set:{ 'empty.field.a': 3 }});
  });

  Tinytest.add("minimongo - can selector become true by modifier - literals (adhoc tests)", function (t) {
    test = t;
    T({x:1}, {$set:{x:1}}, "simple set scalar");
    T({x:"a"}, {$set:{x:"a"}}, "simple set scalar");
    T({x:false}, {$set:{x:false}}, "simple set scalar");
    F({x:true}, {$set:{x:false}}, "simple set scalar");
    F({x:2}, {$set:{x:3}}, "simple set scalar");

    F({'foo.bar.baz': 1, x:1}, {$unset:{'foo.bar.baz': 1}, $set:{x:1}}, "simple unset of the interesting path");
    F({'foo.bar.baz': 1, x:1}, {$unset:{'foo.bar': 1}, $set:{x:1}}, "simple unset of the interesting path prefix");
    F({'foo.bar.baz': 1, x:1}, {$unset:{'foo': 1}, $set:{x:1}}, "simple unset of the interesting path prefix");
    F({'foo.bar.baz': 1}, {$unset:{'foo.baz': 1}}, "simple unset of the interesting path prefix");
    F({'foo.bar.baz': 1}, {$unset:{'foo.bar.bar': 1}}, "simple unset of the interesting path prefix");
  });

  Tinytest.add("minimongo - can selector become true by modifier - regexps", function (t) {
    test = t;

    // Regexp
    T({ 'foo.bar': /^[0-9]+$/i }, { $set: {'foo.bar': '01233'} }, "set of regexp");
    // XXX this test should be False, should be fixed within improved implementation
    T({ 'foo.bar': /^[0-9]+$/i, x: 1 }, { $set: {'foo.bar': '0a1233', x: 1} }, "set of regexp");
    // XXX this test should be False, should be fixed within improved implementation
    T({ 'foo.bar': /^[0-9]+$/i, x: 1 }, { $unset: {'foo.bar': 1}, $set: { x: 1 } }, "unset of regexp");
    T({ 'foo.bar': /^[0-9]+$/i, x: 1 }, { $set: { x: 1 } }, "don't touch regexp");
  });

  Tinytest.add("minimongo - can selector become true by modifier - undefined/null", function (t) {
    test = t;
    // Nulls / Undefined
    T({ 'foo.bar': null }, {$set:{'foo.bar': null}}, "set of null looking for null");
    T({ 'foo.bar': null }, {$set:{'foo.bar': undefined}}, "set of undefined looking for null");
    T({ 'foo.bar': undefined }, {$set:{'foo.bar': null}}, "set of null looking for undefined");
    T({ 'foo.bar': undefined }, {$set:{'foo.bar': undefined}}, "set of undefined looking for undefined");
    T({ 'foo.bar': null }, {$set:{'foo': null}}, "set of null of parent path looking for null");
    F({ 'foo.bar': null }, {$set:{'foo.bar.baz': null}}, "set of null of different path looking for null");
    T({ 'foo.bar': null }, { $unset: { 'foo': 1 } }, "unset the parent");
    T({ 'foo.bar': null }, { $unset: { 'foo.bar': 1 } }, "unset tracked path");
    T({ 'foo.bar': null }, { $set: { 'foo': 3 } }, "set the parent");
    T({ 'foo.bar': null }, { $set: { 'foo': {baz:1} } }, "set the parent");

  });

  Tinytest.add("minimongo - can selector become true by modifier - literals with arrays", function (t) {
    test = t;
    // These tests are incomplete and in theory they all should return true as we
    // don't support any case with numeric fields yet.
    T({'a.1.b': 1, x:1}, {$unset:{'a.1.b': 1}, $set:{x:1}}, "unset of array element's field with exactly the same index as selector");
    F({'a.2.b': 1}, {$unset:{'a.1.b': 1}}, "unset of array element's field with different index as selector");
    // This is false, because if you are looking for array but in reality it is an
    // object, it just can't get to true.
    F({'a.2.b': 1}, {$unset:{'a.b': 1}}, "unset of field while selector is looking for index");
    T({ 'foo.bar': null }, {$set:{'foo.1.bar': null}}, "set array's element's field to null looking for null");
    T({ 'foo.bar': null }, {$set:{'foo.0.bar': 1, 'foo.1.bar': null}}, "set array's element's field to null looking for null");
    // This is false, because there may remain other array elements that match
    // but we modified this test as we don't support this case yet
    T({'a.b': 1}, {$unset:{'a.1.b': 1}}, "unset of array element's field");
  });

  Tinytest.add("minimongo - can selector become true by modifier - set an object literal whose fields are selected", function (t) {
    test = t;
    T({ 'a.b.c': 1 }, { $set: { 'a.b': { c: 1 } } }, "a simple scalar selector and simple set");
    F({ 'a.b.c': 1 }, { $set: { 'a.b': { c: 2 } } }, "a simple scalar selector and simple set to false");
    F({ 'a.b.c': 1 }, { $set: { 'a.b': { d: 1 } } }, "a simple scalar selector and simple set a wrong literal");
    F({ 'a.b.c': 1 }, { $set: { 'a.b': 222 } }, "a simple scalar selector and simple set a wrong type");
  });

  Tinytest.add("minimongo - can selector become true by modifier - $-scalar selectors and simple tests", function (t) {
    test = t;
    T({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { c: 4 } } }, "nested $lt");
    F({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { c: 5 } } }, "nested $lt");
    F({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { c: 6 } } }, "nested $lt");
    F({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b.d': 7 } }, "nested $lt, the change doesn't matter");
    F({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { d: 7 } } }, "nested $lt, the key disappears");
    T({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { d: 7, c: -1 } } }, "nested $lt");
    F({ a: { $lt: 10, $gt: 3 } }, { $unset: { a: 1 } }, "unset $lt");
    T({ a: { $lt: 10, $gt: 3 } }, { $set: { a: 4 } }, "set between x and y");
    F({ a: { $lt: 10, $gt: 3 } }, { $set: { a: 3 } }, "set between x and y");
    F({ a: { $lt: 10, $gt: 3 } }, { $set: { a: 10 } }, "set between x and y");
    F({ a: { $gt: 10, $lt: 3 } }, { $set: { a: 9 } }, "impossible statement");
    T({ a: { $lte: 10, $gte: 3 } }, { $set: { a: 3 } }, "set between x and y");
    T({ a: { $lte: 10, $gte: 3 } }, { $set: { a: 10 } }, "set between x and y");
    F({ a: { $lte: 10, $gte: 3 } }, { $set: { a: -10 } }, "set between x and y");
    T({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 } }, { $set: { a: 4 } }, "set between x and y");
    F({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 } }, { $set: { a: 3 } }, "set between x and y");
    F({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 } }, { $set: { a: 10 } }, "set between x and y");
    F({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 } }, { $set: { a: Infinity } }, "set between x and y");
    T({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 }, x: 1 }, { $set: { x: 1 } }, "set between x and y - dummy");
    F({ a: { $lte: 10, $gte: 13, $gt: 3, $lt: 9 }, x: 1 }, { $set: { x: 1 } }, "set between x and y - dummy - impossible");
    F({ a: { $lte: 10 } }, { $set: { a: Infinity } }, "Infinity <= 10?");
    T({ a: { $lte: 10 } }, { $set: { a: -Infinity } }, "-Infinity <= 10?");
    // XXX is this sufficient?
    T({ a: { $gt: 9.99999999999999, $lt: 10 }, x: 1 }, { $set: { x: 1 } }, "very close $gt and $lt");
    // XXX this test should be F, but since it is so hard to be precise in
    // floating point math, the current implementation falls back to T
    T({ a: { $gt: 9.999999999999999, $lt: 10 }, x: 1 }, { $set: { x: 1 } }, "very close $gt and $lt");
    T({ a: { $ne: 5 } }, { $unset: { a: 1 } }, "unset of $ne");
    T({ a: { $ne: 5 } }, { $set: { a: 1 } }, "set of $ne");
    T({ a: { $ne: "some string" }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: true }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: false }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: null }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: Infinity }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: 5 } }, { $set: { a: -10 } }, "set of $ne");
    T({ a: { $in: [1, 3, 5, 7] } }, { $set: { a: 5 } }, "$in checks");
    F({ a: { $in: [1, 3, 5, 7] } }, { $set: { a: -5 } }, "$in checks");
    T({ a: { $in: [1, 3, 5, 7], $gt: 6 }, x: 1 }, { $set: { x: 1 } }, "$in combination with $gt");
    F({ a: { $lte: 10, $gte: 3 } }, { $set: { 'a.b': -10 } }, "sel between x and y, set its subfield");
    F({ b: { $in: [1, 3, 5, 7] } }, { $set: { 'b.c': 2 } }, "sel $in, set subfield");
    T({ b: { $in: [1, 3, 5, 7] } }, { $set: { 'bd.c': 2, b: 3 } }, "sel $in, set similar subfield");
    F({ 'b.c': { $in: [1, 3, 5, 7] } }, { $set: { b: 2 } }, "sel subfield of set scalar");
    // If modifier tries to set a sub-field of a path expected to be a scalar.
    F({ 'a.b': { $gt: 5, $lt: 7}, x: 1 }, { $set: { 'a.b.c': 3, x: 1 } }, "set sub-field of $gt,$lt operator (scalar expected)");
    F({ 'a.b': { $gt: 5, $lt: 7}, x: 1 }, { $set: { x: 1 }, $unset: { 'a.b.c': 1 } }, "unset sub-field of $gt,$lt operator (scalar expected)");
  });

  Tinytest.add("minimongo - can selector become true by modifier - $-nonscalar selectors and simple tests", function (t) {
    test = t;
    T({ a: { $ne: { x: 5 } } }, { $set: { 'a.x': 3 } }, "set of $ne");
    // XXX this test should be F, but it is not implemented yet
    T({ a: { $ne: { x: 5 } } }, { $set: { 'a.x': 5 } }, "set of $ne");
    T({ a: { $in: [{ b: 1 }, { b: 3 }] } }, { $set: { a: { b: 3 } } }, "$in checks");
    // XXX this test should be F, but it is not implemented yet
    T({ a: { $in: [{ b: 1 }, { b: 3 }] } }, { $set: { a: { v: 3 } } }, "$in checks");
    T({ a: { $ne: { a: 2 } }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    // XXX this test should be F, but it is not implemented yet
    T({ a: { $ne: { a: 2 } } }, { $set: { a: { a: 2 } } }, "$ne object");
  });
})();

