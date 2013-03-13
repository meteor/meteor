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
