Tinytest.add("ejson - keyOrderSensitive", function (test) {
  test.isTrue(EJSON.equals({
    a: {b: 1, c: 2},
    d: {e: 3, f: 4}
  }, {
    d: {f: 4, e: 3},
    a: {c: 2, b: 1}
  }));

  test.isFalse(EJSON.equals({
    a: {b: 1, c: 2},
    d: {e: 3, f: 4}
  }, {
    d: {f: 4, e: 3},
    a: {c: 2, b: 1}
  }, {keyOrderSensitive: true}));

  test.isFalse(EJSON.equals({
    a: {b: 1, c: 2},
    d: {e: 3, f: 4}
  }, {
    a: {c: 2, b: 1},
    d: {f: 4, e: 3}
  }, {keyOrderSensitive: true}));
  test.isFalse(EJSON.equals({a: {}}, {a: {b:2}}, {keyOrderSensitive: true}));
  test.isFalse(EJSON.equals({a: {b:2}}, {a: {}}, {keyOrderSensitive: true}));
});

Tinytest.add("ejson - nesting and literal", function (test) {
  var d = new Date;
  var obj = {$date: d};
  var eObj = EJSON.toJSONValue(obj);
  var roundTrip = EJSON.fromJSONValue(eObj);
  test.equal(obj, roundTrip);
});

Tinytest.add("ejson - some equality tests", function (test) {
  test.isTrue(EJSON.equals({a: 1, b: 2, c: 3}, {a: 1, c: 3, b: 2}));
  test.isFalse(EJSON.equals({a: 1, b: 2}, {a: 1, c: 3, b: 2}));
  test.isFalse(EJSON.equals({a: 1, b: 2, c: 3}, {a: 1, b: 2}));
  test.isFalse(EJSON.equals({a: 1, b: 2, c: 3}, {a: 1, c: 3, b: 4}));
  test.isFalse(EJSON.equals({a: {}}, {a: {b:2}}));
  test.isFalse(EJSON.equals({a: {b:2}}, {a: {}}));
});

Tinytest.add("ejson - equality and falsiness", function (test) {
  test.isTrue(EJSON.equals(null, null));
  test.isTrue(EJSON.equals(undefined, undefined));
  test.isFalse(EJSON.equals({foo: "foo"}, null));
  test.isFalse(EJSON.equals(null, {foo: "foo"}));
  test.isFalse(EJSON.equals(undefined, {foo: "foo"}));
  test.isFalse(EJSON.equals({foo: "foo"}, undefined));
});

Tinytest.add("ejson - NaN and Inf", function (test) {
  test.equal(EJSON.parse("{\"$InfNaN\": 1}"), Infinity);
  test.equal(EJSON.parse("{\"$InfNaN\": -1}"), -Infinity);
  test.isTrue(_.isNaN(EJSON.parse("{\"$InfNaN\": 0}")));
  test.equal(EJSON.parse(EJSON.stringify(Infinity)), Infinity);
  test.equal(EJSON.parse(EJSON.stringify(-Infinity)), -Infinity);
  test.isTrue(_.isNaN(EJSON.parse(EJSON.stringify(NaN))));
  test.isTrue(EJSON.equals(NaN, NaN));
  test.isTrue(EJSON.equals(Infinity, Infinity));
  test.isTrue(EJSON.equals(-Infinity, -Infinity));
  test.isFalse(EJSON.equals(Infinity, -Infinity));
  test.isFalse(EJSON.equals(Infinity, NaN));
  test.isFalse(EJSON.equals(Infinity, 0));
  test.isFalse(EJSON.equals(NaN, 0));

  test.isTrue(EJSON.equals(
    EJSON.parse("{\"a\": {\"$InfNaN\": 1}}"),
    {a: Infinity}
  ));
  test.isTrue(EJSON.equals(
    EJSON.parse("{\"a\": {\"$InfNaN\": 0}}"),
    {a: NaN}
  ));
});

Tinytest.add("ejson - clone", function (test) {
  var cloneTest = function (x, identical) {
    var y = EJSON.clone(x);
    test.isTrue(EJSON.equals(x, y));
    test.equal(x === y, !!identical);
  };
  cloneTest(null, true);
  cloneTest(undefined, true);
  cloneTest(42, true);
  cloneTest("asdf", true);
  cloneTest([1, 2, 3]);
  cloneTest([1, "fasdf", {foo: 42}]);
  cloneTest({x: 42, y: "asdf"});

  var testCloneArgs = function (/*arguments*/) {
    var clonedArgs = EJSON.clone(arguments);
    test.equal(clonedArgs, [1, 2, "foo", [4]]);
  };
  testCloneArgs(1, 2, "foo", [4]);
});

Tinytest.add("ejson - stringify", function (test) {
  test.equal(EJSON.stringify(null), "null");
  test.equal(EJSON.stringify(true), "true");
  test.equal(EJSON.stringify(false), "false");
  test.equal(EJSON.stringify(123), "123");
  test.equal(EJSON.stringify("abc"), "\"abc\"");

  test.equal(EJSON.stringify([1, 2, 3]),
     "[1,2,3]"
  );
  test.equal(EJSON.stringify([1, 2, 3], {indent: true}),
    "[\n  1,\n  2,\n  3\n]"
  );
  test.equal(EJSON.stringify([1, 2, 3], {canonical: false}),
    "[1,2,3]"
  );
  test.equal(EJSON.stringify([1, 2, 3], {indent: true, canonical: false}),
    "[\n  1,\n  2,\n  3\n]"
  );

  test.equal(EJSON.stringify([1, 2, 3], {indent: 4}),
    "[\n    1,\n    2,\n    3\n]"
  );
  test.equal(EJSON.stringify([1, 2, 3], {indent: '--'}),
    "[\n--1,\n--2,\n--3\n]"
  );

  test.equal(
    EJSON.stringify(
      {b: [2, {d: 4, c: 3}], a: 1},
      {canonical: true}
    ),
    "{\"a\":1,\"b\":[2,{\"c\":3,\"d\":4}]}"
  );
  test.equal(
    EJSON.stringify(
      {b: [2, {d: 4, c: 3}], a: 1},
      {
        indent: true,
        canonical: true
      }
    ),
    "{\n" +
    "  \"a\": 1,\n" +
    "  \"b\": [\n" +
    "    2,\n" +
    "    {\n" +
    "      \"c\": 3,\n" +
    "      \"d\": 4\n" +
    "    }\n" +
    "  ]\n" +
    "}"
  );
  test.equal(
    EJSON.stringify(
      {b: [2, {d: 4, c: 3}], a: 1},
      {canonical: false}
    ),
    "{\"b\":[2,{\"d\":4,\"c\":3}],\"a\":1}"
  );
  test.equal(
    EJSON.stringify(
      {b: [2, {d: 4, c: 3}], a: 1},
      {indent: true, canonical: false}
    ),
    "{\n" +
    "  \"b\": [\n" +
    "    2,\n" +
    "    {\n" +
    "      \"d\": 4,\n" +
    "      \"c\": 3\n" +
    "    }\n" +
    "  ],\n" +
    "  \"a\": 1\n" +
    "}"

  );
});

Tinytest.add("ejson - parse", function (test) {
  test.equal(EJSON.parse("[1,2,3]"), [1,2,3]);
  test.throws(
    function () { EJSON.parse(null) },
    /argument should be a string/
  );
});

Tinytest.add("ejson - custom types", function (test) {
  var testSameConstructors = function (obj, compareWith) {
    test.equal(obj.constructor, compareWith.constructor);
    if (typeof obj === 'object') {
      _.each(obj, function(value, key) {
        testSameConstructors(value, compareWith[key]);
      });
    }
  }
  var testReallyEqual = function (obj, compareWith) {
    test.equal(obj, compareWith);
    testSameConstructors(obj, compareWith);
  }
  var testRoundTrip = function (obj) {
    var str = EJSON.stringify(obj);
    var roundTrip = EJSON.parse(str);
    testReallyEqual(obj, roundTrip);
  }
  var testCustomObject = function (obj) {
    testRoundTrip(obj);
    testReallyEqual(obj, EJSON.clone(obj));
  }

  var a = new EJSONTest.Address('Montreal', 'Quebec');
  testCustomObject( {address: a} );
  // Test that difference is detected even if they
  // have similar toJSONValue results:
  var nakedA = {city: 'Montreal', state: 'Quebec'};
  test.notEqual(nakedA, a);
  test.notEqual(a, nakedA);
  var holder = new EJSONTest.Holder(nakedA);
  test.equal(holder.toJSONValue(), a.toJSONValue()); // sanity check
  test.notEqual(holder, a);
  test.notEqual(a, holder);


  var d = new Date;
  var obj = new EJSONTest.Person("John Doe", d, a);
  testCustomObject( obj );

  // Test clone is deep:
  var clone = EJSON.clone(obj);
  clone.address.city = 'Sherbrooke';
  test.notEqual( obj, clone );
});
