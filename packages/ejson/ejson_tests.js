import { EJSON } from './ejson';
import EJSONTest from './custom_models_for_tests';

Tinytest.add('ejson - keyOrderSensitive', test => {
  test.isTrue(EJSON.equals({
    a: {b: 1, c: 2},
    d: {e: 3, f: 4},
  }, {
    d: {f: 4, e: 3},
    a: {c: 2, b: 1},
  }));

  test.isFalse(EJSON.equals({
    a: {b: 1, c: 2},
    d: {e: 3, f: 4},
  }, {
    d: {f: 4, e: 3},
    a: {c: 2, b: 1},
  }, {keyOrderSensitive: true}));

  test.isFalse(EJSON.equals({
    a: {b: 1, c: 2},
    d: {e: 3, f: 4},
  }, {
    a: {c: 2, b: 1},
    d: {f: 4, e: 3},
  }, {keyOrderSensitive: true}));
  test.isFalse(EJSON.equals({a: {}}, {a: {b: 2}}, {keyOrderSensitive: true}));
  test.isFalse(EJSON.equals({a: {b: 2}}, {a: {}}, {keyOrderSensitive: true}));
});

Tinytest.add('ejson - nesting and literal', test => {
  const d = new Date();
  const obj = {$date: d};
  const eObj = EJSON.toJSONValue(obj);
  const roundTrip = EJSON.fromJSONValue(eObj);
  test.equal(obj, roundTrip);
});

Tinytest.add('ejson - some equality tests', test => {
  test.isTrue(EJSON.equals({a: 1, b: 2, c: 3}, {a: 1, c: 3, b: 2}));
  test.isFalse(EJSON.equals({a: 1, b: 2}, {a: 1, c: 3, b: 2}));
  test.isFalse(EJSON.equals({a: 1, b: 2, c: 3}, {a: 1, b: 2}));
  test.isFalse(EJSON.equals({a: 1, b: 2, c: 3}, {a: 1, c: 3, b: 4}));
  test.isFalse(EJSON.equals({a: {}}, {a: {b: 2}}));
  test.isFalse(EJSON.equals({a: {b: 2}}, {a: {}}));
  // XXX: Object and Array were previously mistaken, which is why
  // we add some extra tests for them here
  test.isTrue(EJSON.equals([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]));
  test.isFalse(EJSON.equals([1, 2, 3, 4, 5], [1, 2, 3, 4]));
  test.isFalse(EJSON.equals([1,2,3,4], {0: 1, 1: 2, 2: 3, 3: 4}));
  test.isFalse(EJSON.equals({0: 1, 1: 2, 2: 3, 3: 4}, [1,2,3,4]));
  test.isFalse(EJSON.equals({}, []));
  test.isFalse(EJSON.equals([], {}));
});

Tinytest.add('ejson - equality and falsiness', test => {
  test.isTrue(EJSON.equals(null, null));
  test.isTrue(EJSON.equals(undefined, undefined));
  test.isFalse(EJSON.equals({foo: 'foo'}, null));
  test.isFalse(EJSON.equals(null, {foo: 'foo'}));
  test.isFalse(EJSON.equals(undefined, {foo: 'foo'}));
  test.isFalse(EJSON.equals({foo: 'foo'}, undefined));
});

Tinytest.add('ejson - NaN and Inf', test => {
  test.equal(EJSON.parse('{"$InfNaN": 1}'), Infinity);
  test.equal(EJSON.parse('{"$InfNaN": -1}'), -Infinity);
  test.isTrue(Number.isNaN(EJSON.parse('{"$InfNaN": 0}')));
  test.equal(EJSON.parse(EJSON.stringify(Infinity)), Infinity);
  test.equal(EJSON.parse(EJSON.stringify(-Infinity)), -Infinity);
  test.isTrue(Number.isNaN(EJSON.parse(EJSON.stringify(NaN))));
  test.isTrue(EJSON.equals(NaN, NaN));
  test.isTrue(EJSON.equals(Infinity, Infinity));
  test.isTrue(EJSON.equals(-Infinity, -Infinity));
  test.isFalse(EJSON.equals(Infinity, -Infinity));
  test.isFalse(EJSON.equals(Infinity, NaN));
  test.isFalse(EJSON.equals(Infinity, 0));
  test.isFalse(EJSON.equals(NaN, 0));

  test.isTrue(EJSON.equals(
    EJSON.parse('{"a": {"$InfNaN": 1}}'),
    {a: Infinity}
  ));
  test.isTrue(EJSON.equals(
    EJSON.parse('{"a": {"$InfNaN": 0}}'),
    {a: NaN}
  ));
});

Tinytest.add('ejson - clone', test => {
  const cloneTest = (x, identical) => {
    const y = EJSON.clone(x);
    test.isTrue(EJSON.equals(x, y));
    test.equal(x === y, !!identical);
  };
  cloneTest(null, true);
  cloneTest(undefined, true);
  cloneTest(42, true);
  cloneTest('asdf', true);
  cloneTest([1, 2, 3]);
  cloneTest([1, 'fasdf', {foo: 42}]);
  cloneTest({x: 42, y: 'asdf'});

  function testCloneArgs(/*arguments*/) {
    const clonedArgs = EJSON.clone(arguments);
    test.equal(clonedArgs, [1, 2, 'foo', [4]]);
  };
  testCloneArgs(1, 2, 'foo', [4]);
});

Tinytest.add('ejson - stringify', test => {
  test.equal(EJSON.stringify(null), 'null');
  test.equal(EJSON.stringify(true), 'true');
  test.equal(EJSON.stringify(false), 'false');
  test.equal(EJSON.stringify(123), '123');
  test.equal(EJSON.stringify('abc'), '"abc"');

  test.equal(EJSON.stringify([1, 2, 3]),
     '[1,2,3]'
  );
  test.equal(EJSON.stringify([1, 2, 3], {indent: true}),
    '[\n  1,\n  2,\n  3\n]'
  );
  test.equal(EJSON.stringify([1, 2, 3], {canonical: false}),
    '[1,2,3]'
  );
  test.equal(EJSON.stringify([1, 2, 3], {indent: true, canonical: false}),
    '[\n  1,\n  2,\n  3\n]'
  );

  test.equal(EJSON.stringify([1, 2, 3], {indent: 4}),
    '[\n    1,\n    2,\n    3\n]'
  );
  test.equal(EJSON.stringify([1, 2, 3], {indent: '--'}),
    '[\n--1,\n--2,\n--3\n]'
  );

  test.equal(
    EJSON.stringify(
      {b: [2, {d: 4, c: 3}], a: 1},
      {canonical: true}
    ),
    '{"a":1,"b":[2,{"c":3,"d":4}]}'
  );
  test.equal(
    EJSON.stringify(
      {b: [2, {d: 4, c: 3}], a: 1},
      {
        indent: true,
        canonical: true,
      }
    ),
    '{\n' +
    '  "a": 1,\n' +
    '  "b": [\n' +
    '    2,\n' +
    '    {\n' +
    '      "c": 3,\n' +
    '      "d": 4\n' +
    '    }\n' +
    '  ]\n' +
    '}'
  );
  test.equal(
    EJSON.stringify(
      {b: [2, {d: 4, c: 3}], a: 1},
      {canonical: false}
    ),
    '{"b":[2,{"d":4,"c":3}],"a":1}'
  );
  test.equal(
    EJSON.stringify(
      {b: [2, {d: 4, c: 3}], a: 1},
      {indent: true, canonical: false}
    ),
    '{\n' +
    '  "b": [\n' +
    '    2,\n' +
    '    {\n' +
    '      "d": 4,\n' +
    '      "c": 3\n' +
    '    }\n' +
    '  ],\n' +
    '  "a": 1\n' +
    '}'
  );

  test.throws(
    () => {
      const col = new Mongo.Collection('test');
      EJSON.stringify(col)
    },
    /Converting circular structure to JSON/
  );
});

Tinytest.add('ejson - parse', test => {
  test.equal(EJSON.parse('[1,2,3]'), [1, 2, 3]);
  test.throws(
    () => { EJSON.parse(null); },
    /argument should be a string/
  );
});

Tinytest.add("ejson - regexp", test => {
  test.equal(EJSON.stringify(/foo/gi), "{\"$regexp\":\"foo\",\"$flags\":\"gi\"}");
  var d = new RegExp("foo", "gi");
  var obj = { $regexp: "foo", $flags: "gi" };

  var eObj = EJSON.toJSONValue(obj);
  var roundTrip = EJSON.fromJSONValue(eObj);
  test.equal(obj, roundTrip);
});

Tinytest.add('ejson - custom types', test => {
  const testSameConstructors = (someObj, compareWith) => {
    test.equal(someObj.constructor, compareWith.constructor);
    if (typeof someObj === 'object') {
      Object.keys(someObj).forEach(key => {
        const value = someObj[key];
        testSameConstructors(value, compareWith[key]);
      });
    }
  };

  const testReallyEqual = (someObj, compareWith) => {
    test.equal(someObj, compareWith);
    testSameConstructors(someObj, compareWith);
  };

  const testRoundTrip = (someObj) => {
    const str = EJSON.stringify(someObj);
    const roundTrip = EJSON.parse(str);
    testReallyEqual(someObj, roundTrip);
  };

  const testCustomObject = (someObj) => {
    testRoundTrip(someObj);
    testReallyEqual(someObj, EJSON.clone(someObj));
  };

  const a = new EJSONTest.Address('Montreal', 'Quebec');
  testCustomObject( {address: a} );
  // Test that difference is detected even if they
  // have similar toJSONValue results:
  const nakedA = {city: 'Montreal', state: 'Quebec'};
  test.notEqual(nakedA, a);
  test.notEqual(a, nakedA);
  const holder = new EJSONTest.Holder(nakedA);
  test.equal(holder.toJSONValue(), a.toJSONValue()); // sanity check
  test.notEqual(holder, a);
  test.notEqual(a, holder);

  const d = new Date();
  const obj = new EJSONTest.Person('John Doe', d, a);
  testCustomObject( obj );

  // Test clone is deep:
  const clone = EJSON.clone(obj);
  clone.address.city = 'Sherbrooke';
  test.notEqual( obj, clone );
});

// Verify objects with a property named "length" can be handled by the EJSON
// API properly (see https://github.com/meteor/meteor/issues/5175).
Tinytest.add('ejson - handle objects with properties named "length"', test => {
  class Widget {
    constructor() {
      this.length = 10;
    }
  }
  const widget = new Widget();

  const toJsonWidget = EJSON.toJSONValue(widget);
  test.equal(widget, toJsonWidget);

  const fromJsonWidget = EJSON.fromJSONValue(widget);
  test.equal(widget, fromJsonWidget);

  const stringifiedWidget = EJSON.stringify(widget);
  test.equal(stringifiedWidget, '{"length":10}');

  const parsedWidget = EJSON.parse('{"length":10}');
  test.equal({ length: 10 }, parsedWidget);

  test.isFalse(binary.isBinary(widget));

  const widget2 = new Widget();
  test.isTrue(widget, widget2);

  const clonedWidget = EJSON.clone(widget);
  test.equal(widget, clonedWidget);
});
