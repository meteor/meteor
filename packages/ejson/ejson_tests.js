import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EJSON } from './ejson';
import EJSONTest from './custom_models_for_tests';

describe('ejson', () => {
  it('keyOrderSensitive', () => {
    assert.ok(EJSON.equals({
      a: {b: 1, c: 2},
      d: {e: 3, f: 4},
    }, {
      d: {f: 4, e: 3},
      a: {c: 2, b: 1},
    }));

    assert.ok(!EJSON.equals({
      a: {b: 1, c: 2},
      d: {e: 3, f: 4},
    }, {
      d: {f: 4, e: 3},
      a: {c: 2, b: 1},
    }, {keyOrderSensitive: true}));

    assert.ok(!EJSON.equals({
      a: {b: 1, c: 2},
      d: {e: 3, f: 4},
    }, {
      a: {c: 2, b: 1},
      d: {f: 4, e: 3},
    }, {keyOrderSensitive: true}));
    assert.ok(!EJSON.equals({a: {}}, {a: {b: 2}}, {keyOrderSensitive: true}));
    assert.ok(!EJSON.equals({a: {b: 2}}, {a: {}}, {keyOrderSensitive: true}));
  });

  it('nesting and literal', () => {
    const d = new Date();
    const obj = {$date: d};
    const eObj = EJSON.toJSONValue(obj);
    const roundTrip = EJSON.fromJSONValue(eObj);
    assert.deepStrictEqual(obj, roundTrip);
  });

  it('some equality tests', () => {
    assert.ok(EJSON.equals({a: 1, b: 2, c: 3}, {a: 1, c: 3, b: 2}));
    assert.ok(!EJSON.equals({a: 1, b: 2}, {a: 1, c: 3, b: 2}));
    assert.ok(!EJSON.equals({a: 1, b: 2, c: 3}, {a: 1, b: 2}));
    assert.ok(!EJSON.equals({a: 1, b: 2, c: 3}, {a: 1, c: 3, b: 4}));
    assert.ok(!EJSON.equals({a: {}}, {a: {b: 2}}));
    assert.ok(!EJSON.equals({a: {b: 2}}, {a: {}}));
    assert.ok(EJSON.equals([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]));
    assert.ok(!EJSON.equals([1, 2, 3, 4, 5], [1, 2, 3, 4]));
    assert.ok(!EJSON.equals([1,2,3,4], {0: 1, 1: 2, 2: 3, 3: 4}));
    assert.ok(!EJSON.equals({0: 1, 1: 2, 2: 3, 3: 4}, [1,2,3,4]));
    assert.ok(!EJSON.equals({}, []));
    assert.ok(!EJSON.equals([], {}));
  });

  it('equality and falsiness', () => {
    assert.ok(EJSON.equals(null, null));
    assert.ok(EJSON.equals(undefined, undefined));
    assert.ok(!EJSON.equals({foo: 'foo'}, null));
    assert.ok(!EJSON.equals(null, {foo: 'foo'}));
    assert.ok(!EJSON.equals(undefined, {foo: 'foo'}));
    assert.ok(!EJSON.equals({foo: 'foo'}, undefined));
  });

  it('NaN and Inf', () => {
    assert.strictEqual(EJSON.parse('{"$InfNaN": 1}'), Infinity);
    assert.strictEqual(EJSON.parse('{"$InfNaN": -1}'), -Infinity);
    assert.ok(Number.isNaN(EJSON.parse('{"$InfNaN": 0}')));
    assert.strictEqual(EJSON.parse(EJSON.stringify(Infinity)), Infinity);
    assert.strictEqual(EJSON.parse(EJSON.stringify(-Infinity)), -Infinity);
    assert.ok(Number.isNaN(EJSON.parse(EJSON.stringify(NaN))));
    assert.ok(EJSON.equals(NaN, NaN));
    assert.ok(EJSON.equals(Infinity, Infinity));
    assert.ok(EJSON.equals(-Infinity, -Infinity));
    assert.ok(!EJSON.equals(Infinity, -Infinity));
    assert.ok(!EJSON.equals(Infinity, NaN));
    assert.ok(!EJSON.equals(Infinity, 0));
    assert.ok(!EJSON.equals(NaN, 0));

    assert.ok(EJSON.equals(
      EJSON.parse('{"a": {"$InfNaN": 1}}'),
      {a: Infinity}
    ));
    assert.ok(EJSON.equals(
      EJSON.parse('{"a": {"$InfNaN": 0}}'),
      {a: NaN}
    ));
  });

  it('clone', () => {
    const cloneTest = (x, identical) => {
      const y = EJSON.clone(x);
      assert.ok(EJSON.equals(x, y));
      assert.strictEqual(x === y, !!identical);
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
      assert.deepStrictEqual(clonedArgs, [1, 2, 'foo', [4]]);
    }
    testCloneArgs(1, 2, 'foo', [4]);
  });

  it('stringify', () => {
    assert.strictEqual(EJSON.stringify(null), 'null');
    assert.strictEqual(EJSON.stringify(true), 'true');
    assert.strictEqual(EJSON.stringify(false), 'false');
    assert.strictEqual(EJSON.stringify(123), '123');
    assert.strictEqual(EJSON.stringify('abc'), '"abc"');

    assert.strictEqual(EJSON.stringify([1, 2, 3]), '[1,2,3]');
    assert.strictEqual(EJSON.stringify([1, 2, 3], {indent: true}),
      '[\n  1,\n  2,\n  3\n]');
    assert.strictEqual(EJSON.stringify([1, 2, 3], {canonical: false}),
      '[1,2,3]');
    assert.strictEqual(EJSON.stringify([1, 2, 3], {indent: true, canonical: false}),
      '[\n  1,\n  2,\n  3\n]');

    assert.strictEqual(EJSON.stringify([1, 2, 3], {indent: 4}),
      '[\n    1,\n    2,\n    3\n]');
    assert.strictEqual(EJSON.stringify([1, 2, 3], {indent: '--'}),
      '[\n--1,\n--2,\n--3\n]');

    assert.strictEqual(
      EJSON.stringify({b: [2, {d: 4, c: 3}], a: 1}, {canonical: true}),
      '{"a":1,"b":[2,{"c":3,"d":4}]}'
    );
    assert.strictEqual(
      EJSON.stringify({b: [2, {d: 4, c: 3}], a: 1}, {indent: true, canonical: true}),
      '{\n  "a": 1,\n  "b": [\n    2,\n    {\n      "c": 3,\n      "d": 4\n    }\n  ]\n}'
    );
    assert.strictEqual(
      EJSON.stringify({b: [2, {d: 4, c: 3}], a: 1}, {canonical: false}),
      '{"b":[2,{"d":4,"c":3}],"a":1}'
    );
    assert.strictEqual(
      EJSON.stringify({b: [2, {d: 4, c: 3}], a: 1}, {indent: true, canonical: false}),
      '{\n  "b": [\n    2,\n    {\n      "d": 4,\n      "c": 3\n    }\n  ],\n  "a": 1\n}'
    );

    assert.throws(
      () => {
        const col = new Mongo.Collection('test');
        EJSON.stringify(col);
      },
      /Converting circular structure to JSON/
    );
  });

  it('parse', () => {
    assert.deepStrictEqual(EJSON.parse('[1,2,3]'), [1, 2, 3]);
    assert.throws(
      () => { EJSON.parse(null); },
      /argument should be a string/
    );
  });

  it('regexp', () => {
    assert.strictEqual(EJSON.stringify(/foo/gi), '{"$regexp":"foo","$flags":"gi"}');
    const d = new RegExp("foo", "gi");
    const obj = { $regexp: "foo", $flags: "gi" };

    const eObj = EJSON.toJSONValue(obj);
    const roundTrip = EJSON.fromJSONValue(eObj);
    assert.deepStrictEqual(obj, roundTrip);
  });

  it('custom types', () => {
    const testSameConstructors = (someObj, compareWith) => {
      assert.strictEqual(someObj.constructor, compareWith.constructor);
      if (typeof someObj === 'object') {
        Object.keys(someObj).forEach(key => {
          testSameConstructors(someObj[key], compareWith[key]);
        });
      }
    };

    const testReallyEqual = (someObj, compareWith) => {
      assert.ok(EJSON.equals(someObj, compareWith));
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
    testCustomObject({address: a});
    const nakedA = {city: 'Montreal', state: 'Quebec'};
    assert.ok(!EJSON.equals(nakedA, a));
    assert.ok(!EJSON.equals(a, nakedA));
    const holder = new EJSONTest.Holder(nakedA);
    assert.deepStrictEqual(holder.toJSONValue(), a.toJSONValue());
    assert.ok(!EJSON.equals(holder, a));
    assert.ok(!EJSON.equals(a, holder));

    const d = new Date();
    const obj = new EJSONTest.Person('John Doe', d, a);
    testCustomObject(obj);

    const clone = EJSON.clone(obj);
    clone.address.city = 'Sherbrooke';
    assert.ok(!EJSON.equals(obj, clone));
  });

  it('handle objects with properties named "length"', () => {
    class Widget {
      constructor() {
        this.length = 10;
      }
    }
    const widget = new Widget();

    const toJsonWidget = EJSON.toJSONValue(widget);
    assert.ok(EJSON.equals(widget, toJsonWidget));

    const fromJsonWidget = EJSON.fromJSONValue(widget);
    assert.ok(EJSON.equals(widget, fromJsonWidget));

    const stringifiedWidget = EJSON.stringify(widget);
    assert.strictEqual(stringifiedWidget, '{"length":10}');

    const parsedWidget = EJSON.parse('{"length":10}');
    assert.ok(EJSON.equals({ length: 10 }, parsedWidget));

    assert.ok(!EJSON.isBinary(widget));

    const widget2 = new Widget();
    assert.ok(widget); // original was test.isTrue(widget, widget2) which is just truthy check

    const clonedWidget = EJSON.clone(widget);
    assert.ok(EJSON.equals(widget, clonedWidget));
  });
});
