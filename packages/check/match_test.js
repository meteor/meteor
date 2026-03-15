import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check, Match } from 'meteor/check';
import { EJSON } from 'meteor/ejson';

describe('check', () => {
  it('check', () => {
    const matches = (value, pattern) => {
      let error;
      try {
        check(value, pattern);
      } catch (e) {
        error = e;
      }

      assert.ok(!error);
      assert.ok(Match.test(value, pattern));
    };

    const fails = (value, pattern) => {
      let error;
      try {
        check(value, pattern);
      } catch (e) {
        error = e;
      }

      assert.ok(error);
      assert.ok(error instanceof Match.Error);
      assert.ok(!Match.test(value, pattern));
    };

    // Atoms.
    const pairs = [
      ['foo', String],
      ['', String],
      [0, Number],
      [42.59, Number],
      [NaN, Number],
      [Infinity, Number],
      [true, Boolean],
      [false, Boolean],
      [function(){}, Function],
      [undefined, undefined],
      [null, null]
    ];
    pairs.forEach(pair => {
      matches(pair[0], Match.Any);
      [String, Number, Boolean, undefined, null].forEach(type => {
        if (type === pair[1]) {
          matches(pair[0], type);
          matches(pair[0], Match.Optional(type));
          matches(undefined, Match.Optional(type));
          matches(pair[0], Match.Maybe(type));
          matches(undefined, Match.Maybe(type));
          matches(null, Match.Maybe(type));
          matches(pair[0], Match.Where(() => {
            check(pair[0], type);
            return true;
          }));
          matches(pair[0], Match.Where(() => {
            try {
              check(pair[0], type);
              return true;
            } catch (e) {
              return false;
            }
          }));
        } else {
          fails(pair[0], type);
          matches(pair[0], Match.OneOf(type, pair[1]));
          matches(pair[0], Match.OneOf(pair[1], type));
          fails(pair[0], Match.Where(() => {
            check(pair[0], type);
            return true;
          }));
          fails(pair[0], Match.Where(() => {
            try {
              check(pair[0], type);
              return true;
            } catch (e) {
              return false;
            }
          }));
        }

        if ( type !== null ) {

          // Optional doesn't allow null, but does match on null type
          fails(null, Match.Optional(type));
         }
        fails(pair[0], [type]);
        fails(pair[0], Object);
      });
    });
    fails(true, Match.OneOf(String, Number, undefined, null, [Boolean]));
    fails(new String('foo'), String);
    fails(new Boolean(true), Boolean);
    fails(new Number(123), Number);

    matches([1, 2, 3], [Number]);
    matches([], [Number]);
    fails([1, 2, 3, '4'], [Number]);
    fails([1, 2, 3, [4]], [Number]);
    matches([1, 2, 3, '4'], [Match.OneOf(Number, String)]);

    matches({}, Object);
    matches({}, {});
    matches({foo: 42}, Object);
    fails({foo: 42}, {});
    matches({a: 1, b:2}, {b: Number, a: Number});
    fails({a: 1, b:2}, {b: Number});
    matches({a: 1, b:2}, Match.ObjectIncluding({b: Number}));
    fails({a: 1, b:2}, Match.ObjectIncluding({b: String}));
    fails({a: 1, b:2}, Match.ObjectIncluding({c: String}));
    fails({}, {a: Number});
    matches({nodeType: 1}, {nodeType: Match.Any});
    matches({nodeType: 1}, Match.ObjectIncluding({nodeType: Match.Any}));
    fails({nodeType: 1}, {nodeType: String});
    fails({}, Match.ObjectIncluding({nodeType: Match.Any}));

    // Match.Optional does not match on a null value, unless the allowed type is itself "null"
    fails(null, Match.Optional(String));
    fails(null, Match.Optional(undefined));
    matches(null, Match.Optional(null));

    // on the other hand, undefined, works fine for all of them
    matches(undefined, Match.Optional(String));
    matches(undefined, Match.Optional(undefined));
    matches(undefined, Match.Optional(null));

    fails(true, Match.Optional(String)); // different should still fail
    matches('String', Match.Optional(String)); // same should pass

    matches({}, {a: Match.Optional(Number)});
    matches({a: 1}, {a: Match.Optional(Number)});
    fails({a: true}, {a: Match.Optional(Number)});
    fails({a: undefined}, {a: Match.Optional(Number)});

    // .Maybe requires undefined, null or the allowed type in order to match
    matches(null, Match.Maybe(String));
    matches(null, Match.Maybe(undefined));
    matches(null, Match.Maybe(null));

    matches(undefined, Match.Maybe(String));
    matches(undefined, Match.Maybe(undefined));
    matches(undefined, Match.Maybe(null));

    fails(true, Match.Maybe(String)); // different should still fail
    matches('String', Match.Maybe(String)); // same should pass

    matches({}, {a: Match.Maybe(Number)});
    matches({a: 1}, {a: Match.Maybe(Number)});
    fails({a: true}, {a: Match.Maybe(Number)});

    // Match.Optional means "or undefined" at the top level but "or absent" in
    // objects.
    // Match.Maybe should behave the same as Match.Optional in objects
    // including handling nulls
    fails({a: undefined}, {a: Match.Maybe(Number)});
    fails({a: null}, {a: Match.Maybe(Number)});
    const F = function () {
      this.x = 123;
    };

    fails(new F, { x: 123 });

    matches({}, Match.ObjectWithValues(Number));
    matches({x: 1}, Match.ObjectWithValues(Number));
    matches({x: 1, y: 2}, Match.ObjectWithValues(Number));
    fails({x: 1, y: '2'}, Match.ObjectWithValues(Number));

    matches('asdf', 'asdf');
    fails('asdf', 'monkey');
    matches(123, 123);
    fails(123, 456);
    fails('123', 123);
    fails(123, '123');
    matches(true, true);
    matches(false, false);
    fails(true, false);
    fails(true, 'true');
    fails('false', false);
    matches('xx', Match.NonEmptyString);
    fails('', Match.NonEmptyString);
    matches(/foo/, RegExp);
    fails(/foo/, String);
    matches(new Date, Date);
    fails(new Date, Number);
    matches(EJSON.newBinary(42), Match.Where(EJSON.isBinary));
    fails([], Match.Where(EJSON.isBinary));

    matches(42, Match.Where(x => x % 2 === 0));
    fails(43, Match.Where(x => x % 2 === 0));

    matches({
      a: 'something',
      b: [
        {x: 42, k: null},
        {x: 43, k: true, p: ['yay']},
      ],
    }, {
      a: String,
      b: [
        Match.ObjectIncluding({
          x: Number,
          k: Match.OneOf(null, Boolean)
        }),
      ],
    });


    // Match.Integer
    matches(-1, Match.Integer);
    matches(0, Match.Integer);
    matches(1, Match.Integer);
    matches(-2147483648, Match.Integer); // INT_MIN
    matches(2147483647, Match.Integer); // INT_MAX
    fails(123.33, Match.Integer);
    fails(.33, Match.Integer);
    fails(1.348192308491824e+23, Match.Integer);
    fails(NaN, Match.Integer);
    fails(Infinity, Match.Integer);
    fails(-Infinity, Match.Integer);
    fails({}, Match.Integer);
    fails([], Match.Integer);
    fails(function () {}, Match.Integer);
    fails(new Date, Match.Integer);


    // Test non-plain objects.
    const parentObj = {foo: 'bar'};
    const childObj = Object.assign(Object.create(parentObj), {bar: 'foo'});
    matches(parentObj, Object);
    fails(parentObj, {foo: String, bar: String});
    fails(parentObj, {bar: String});
    matches(parentObj, {foo: String});
    fails(childObj, Object);
    fails(childObj, {foo: String, bar: String});
    fails(childObj, {bar: String});
    fails(childObj, {foo: String});

    // Functions
    const testFunction = () => {};
    matches(testFunction, Function);
    fails(5, Function);

    // Circular Reference "Classes"

    const TestInstanceChild = function () {};
    const TestInstanceParent = function (child) {
      child._parent = this;
      this.child = child;
    };

    const testInstanceChild = new TestInstanceChild()
    const testInstanceParent = new TestInstanceParent(testInstanceChild);

    matches(TestInstanceParent, Function);
    matches(testInstanceParent, TestInstanceParent);
    fails(testInstanceChild, TestInstanceParent);

    matches(testInstanceParent, Match.Optional(TestInstanceParent));
    matches(testInstanceParent, Match.Maybe(TestInstanceParent));

    // Circular Reference Objects

    const circleFoo = {};
    const circleBar = {};
    circleFoo.bar = circleBar;
    circleBar.foo = circleFoo;
    fails(circleFoo, null);

    // Test that "arguments" is treated like an array.
    const argumentsMatches = function () {
      matches(arguments, [Number]);
    };
    argumentsMatches();
    argumentsMatches(1);
    argumentsMatches(1, 2);
    const argumentsFails = function () {
      fails(arguments, [Number]);
    };
    argumentsFails('123');
    argumentsFails(1, '23');
  });

  it('check throw all errors', () => {
    const matches = (value, pattern) => {
      let error;
      try {
        check(value, pattern, {throwAllErrors: true});
      } catch (e) {
        error = e;
      }

      assert.ok(!error);
      assert.ok(Match.test(value, pattern));
    };

    const fails = (value, pattern) => {
      let error;

      try {
        check(value, pattern, {throwAllErrors: true});
      } catch (e) {
        error = e;
      }

      assert.ok(error);
      error.every(e => assert.ok(e instanceof Match.Error));
      assert.ok(!Match.test(value, pattern));
    };

    // Atoms.
    const pairs = [
      ['foo', String],
      ['', String],
      [0, Number],
      [42.59, Number],
      [NaN, Number],
      [Infinity, Number],
      [true, Boolean],
      [false, Boolean],
      [function(){}, Function],
      [undefined, undefined],
      [null, null]
    ];
    pairs.forEach(pair => {
      matches(pair[0], Match.Any);
      [String, Number, Boolean, undefined, null].forEach(type => {
        if (type === pair[1]) {
          matches(pair[0], type);
          matches(pair[0], Match.Optional(type));
          matches(undefined, Match.Optional(type));
          matches(pair[0], Match.Maybe(type));
          matches(undefined, Match.Maybe(type));
          matches(null, Match.Maybe(type));
          matches(pair[0], Match.Where(() => {
            check(pair[0], type);
            return true;
          }));
          matches(pair[0], Match.Where(() => {
            try {
              check(pair[0], type);
              return true;
            } catch (e) {
              return false;
            }
          }));
        } else {
          fails(pair[0], type);
          matches(pair[0], Match.OneOf(type, pair[1]));
          matches(pair[0], Match.OneOf(pair[1], type));
          fails(pair[0], Match.Where(() => {
            check(pair[0], type);
            return true;
          }));
          fails(pair[0], Match.Where(() => {
            try {
              check(pair[0], type);
              return true;
            } catch (e) {
              return false;
            }
          }));
        }

        if ( type !== null ) {

          // Optional doesn't allow null, but does match on null type
          fails(null, Match.Optional(type));
         }
        fails(pair[0], [type]);
        fails(pair[0], Object);
      });
    });
    fails(true, Match.OneOf(String, Number, undefined, null, [Boolean]));
    fails(new String('foo'), String);
    fails(new Boolean(true), Boolean);
    fails(new Number(123), Number);

    matches([1, 2, 3], [Number]);
    matches([], [Number]);
    fails([1, 2, 3, '4'], [Number]);
    fails([1, 2, 3, [4]], [Number]);
    matches([1, 2, 3, '4'], [Match.OneOf(Number, String)]);

    matches({}, Object);
    matches({}, {});
    matches({foo: 42}, Object);
    fails({foo: 42}, {});
    matches({a: 1, b:2}, {b: Number, a: Number});
    fails({a: 1, b:2}, {b: Number});
    matches({a: 1, b:2}, Match.ObjectIncluding({b: Number}));
    fails({a: 1, b:2}, Match.ObjectIncluding({b: String}));
    fails({a: 1, b:2}, Match.ObjectIncluding({c: String}));
    fails({}, {a: Number});
    matches({nodeType: 1}, {nodeType: Match.Any});
    matches({nodeType: 1}, Match.ObjectIncluding({nodeType: Match.Any}));
    fails({nodeType: 1}, {nodeType: String});
    fails({}, Match.ObjectIncluding({nodeType: Match.Any}));

    // Match.Optional does not match on a null value, unless the allowed type is itself "null"
    fails(null, Match.Optional(String));
    fails(null, Match.Optional(undefined));
    matches(null, Match.Optional(null));

    // on the other hand, undefined, works fine for all of them
    matches(undefined, Match.Optional(String));
    matches(undefined, Match.Optional(undefined));
    matches(undefined, Match.Optional(null));

    fails(true, Match.Optional(String)); // different should still fail
    matches('String', Match.Optional(String)); // same should pass

    matches({}, {a: Match.Optional(Number)});
    matches({a: 1}, {a: Match.Optional(Number)});
    fails({a: true}, {a: Match.Optional(Number)});
    fails({a: undefined}, {a: Match.Optional(Number)});

    // .Maybe requires undefined, null or the allowed type in order to match
    matches(null, Match.Maybe(String));
    matches(null, Match.Maybe(undefined));
    matches(null, Match.Maybe(null));

    matches(undefined, Match.Maybe(String));
    matches(undefined, Match.Maybe(undefined));
    matches(undefined, Match.Maybe(null));

    fails(true, Match.Maybe(String)); // different should still fail
    matches('String', Match.Maybe(String)); // same should pass

    matches({}, {a: Match.Maybe(Number)});
    matches({a: 1}, {a: Match.Maybe(Number)});
    fails({a: true}, {a: Match.Maybe(Number)});

    // Match.Optional means "or undefined" at the top level but "or absent" in
    // objects.
    // Match.Maybe should behave the same as Match.Optional in objects
    // including handling nulls
    fails({a: undefined}, {a: Match.Maybe(Number)});
    fails({a: null}, {a: Match.Maybe(Number)});
    const F = function () {
      this.x = 123;
    };

    fails(new F, { x: 123 });

    matches({}, Match.ObjectWithValues(Number));
    matches({x: 1}, Match.ObjectWithValues(Number));
    matches({x: 1, y: 2}, Match.ObjectWithValues(Number));
    fails({x: 1, y: '2'}, Match.ObjectWithValues(Number));

    matches('asdf', 'asdf');
    fails('asdf', 'monkey');
    matches(123, 123);
    fails(123, 456);
    fails('123', 123);
    fails(123, '123');
    matches(true, true);
    matches(false, false);
    fails(true, false);
    fails(true, 'true');
    fails('false', false);

    matches(/foo/, RegExp);
    fails(/foo/, String);
    matches(new Date, Date);
    fails(new Date, Number);
    matches(EJSON.newBinary(42), Match.Where(EJSON.isBinary));
    fails([], Match.Where(EJSON.isBinary));

    matches(42, Match.Where(x => x % 2 === 0));
    fails(43, Match.Where(x => x % 2 === 0));

    matches({
      a: 'something',
      b: [
        {x: 42, k: null},
        {x: 43, k: true, p: ['yay']},
      ],
    }, {
      a: String,
      b: [
        Match.ObjectIncluding({
          x: Number,
          k: Match.OneOf(null, Boolean)
        }),
      ],
    });


    // Match.Integer
    matches(-1, Match.Integer);
    matches(0, Match.Integer);
    matches(1, Match.Integer);
    matches(-2147483648, Match.Integer); // INT_MIN
    matches(2147483647, Match.Integer); // INT_MAX
    fails(123.33, Match.Integer);
    fails(.33, Match.Integer);
    fails(1.348192308491824e+23, Match.Integer);
    fails(NaN, Match.Integer);
    fails(Infinity, Match.Integer);
    fails(-Infinity, Match.Integer);
    fails({}, Match.Integer);
    fails([], Match.Integer);
    fails(function () {}, Match.Integer);
    fails(new Date, Match.Integer);


    // Test non-plain objects.
    const parentObj = {foo: 'bar'};
    const childObj = Object.assign(Object.create(parentObj), {bar: 'foo'});
    matches(parentObj, Object);
    fails(parentObj, {foo: String, bar: String});
    fails(parentObj, {bar: String});
    matches(parentObj, {foo: String});
    fails(childObj, Object);
    fails(childObj, {foo: String, bar: String});
    fails(childObj, {bar: String});
    fails(childObj, {foo: String});

    // Functions
    const testFunction = () => {};
    matches(testFunction, Function);
    fails(5, Function);

    // Circular Reference "Classes"

    const TestInstanceChild = function () {};
    const TestInstanceParent = function (child) {
      child._parent = this;
      this.child = child;
    };

    const testInstanceChild = new TestInstanceChild()
    const testInstanceParent = new TestInstanceParent(testInstanceChild);

    matches(TestInstanceParent, Function);
    matches(testInstanceParent, TestInstanceParent);
    fails(testInstanceChild, TestInstanceParent);

    matches(testInstanceParent, Match.Optional(TestInstanceParent));
    matches(testInstanceParent, Match.Maybe(TestInstanceParent));

    // Circular Reference Objects

    const circleFoo = {};
    const circleBar = {};
    circleFoo.bar = circleBar;
    circleBar.foo = circleFoo;
    fails(circleFoo, null);

    // Test that "arguments" is treated like an array.
    const argumentsMatches = function () {
      matches(arguments, [Number]);
    };
    argumentsMatches();
    argumentsMatches(1);
    argumentsMatches(1, 2);
    const argumentsFails = function () {
      fails(arguments, [Number]);
    };
    argumentsFails('123');
    argumentsFails(1, '23');
  });

  it('check throw all errors deeply nested', () => {
    let error;

    const value = {
      text: 1,
      emails: ['2', 3, 4],
      things: [{id: '1', num: 1}, {id: 2, num: 2}, {id: 3, num: '3'}],
      stuff: {foo: 'true', bar: 3, items: [{x: 1, y: '1'}, {x: '2', y: 2}, {x: '3', y: '3'}]},
      any: { a: 'a' },
      maybe: { m: 'm', a: [1, '2'], b: [{x: 1, y: '1'}, {x: '2', y: 2}, {x: '3', y: '3'}] },
      opt: { o: 'm', a: [1, '2'], b: [{x: 1, y: '1'}, {x: '2', y: 2}, {x: '3', y: '3'}] },
      int: { i: 1.2, a: [1, '2'], b: [{x: 1, y: '1'}, {x: '2', y: 2}, {x: '3', y: '3'}] },
      oneOf: { f: 'm', a: [1, '2'], b: [{x: 1, y: '1'}, {x: '2', y: 2}, {x: '3', y: '3'}] },
      where: { w: 'a', a: [1, '2'], b: [{x: 1, y: '1'}, {x: '2', y: 2}, {x: '3', y: '3'}] },
      whereArr: [1, 2, 3],
      embedded: { thing: '1' }
    };

    const pattern = {
      text: String,
      emails: [String],
      things: [{id: String, num: Number}],
      stuff: {foo: Boolean, bar: String, items: [{ x: String, y: Number }]},
      any: Match.Any,
      maybe: { m: Match.Maybe(Number), a: [Match.Maybe(Number)], b: Match.Maybe([{ x: String, y: Number }]) },
      opt: { m: Match.Optional(Number), a: [Match.Optional(Number)], b: Match.Optional([{ x: String, y: Number }]) },
      int: { i: Match.Integer, a: [Match.Integer], b: [{ x: Match.Integer, y: Number }]},
      oneOf: { f: Match.OneOf(Number, Boolean), a: [Match.OneOf(Boolean, Function)], b: [{ x: Match.OneOf(String, Number), y: Match.OneOf(Boolean, null) }]},
      where: {
        w: Match.Where((x) => {
          check(x, String);
          return x.length > 1;
        }),
        a: Match.Where((x) => {
          check(x, [Number]);
          return x > 1;
        })
      },
      whereArr: Match.Where((x) => {
        check(x, [String]);
        return x.length === 1;
      }),
      missing1: String,
      missing2: String,
      embedded: { thing: String, another: String }
    }

    try {
      check(value, pattern, {throwAllErrors: true});
    } catch (e) {
      error = e;
    }

    assert.ok(error);
    assert.strictEqual(error.length, 40);
    assert.deepStrictEqual(
      error.filter(e => e.message.includes('Missing key')).map(e => e.message),
      [`Match error: Missing key 'another' in field embedded`, `Match error: Missing key 'missing1'`, `Match error: Missing key 'missing2'`]
    );
    error.every(e => assert.ok(e instanceof Match.Error));
    assert.ok(!Match.test(value, pattern));
  });

  it('argument checker', () => {
    const checksAllArguments = (f, ...args) =>
      Match._failIfArgumentsAreNotAllChecked(f, {}, args, 'test');
    checksAllArguments(() => {});
    checksAllArguments(x => check(x, Match.Any), undefined);
    checksAllArguments(x => check(x, Match.Any), null);
    checksAllArguments(x => check(x, Match.Any), false);
    checksAllArguments(x => check(x, Match.Any), true);
    checksAllArguments(x => check(x, Match.Any), 0);
    checksAllArguments((a, b, c) => {
      check(a, String);
      check(b, Boolean);
      check(c, Match.Optional(Number));
    }, 'foo', true);
    checksAllArguments((...args) => check(args, [Number]), 1, 2, 4);
    checksAllArguments((x, ...args) => {
      check(x, Number);
      check(args, [String]);
    }, 1, 'foo', 'bar', 'baz');

    // NaN values
    checksAllArguments(x => check(x, Number), NaN);

    const doesntCheckAllArguments = (f, ...args) => {
      try {
        Match._failIfArgumentsAreNotAllChecked(f, {}, args, 'test');
        assert.fail('expected _failIfArgumentsAreNotAllChecked to throw');
      } catch (e) {
        if (e.code === 'ERR_ASSERTION') throw e; // re-throw assert.fail
        assert.strictEqual(e.message, 'Did not check() all arguments during test');
      }
    };

    doesntCheckAllArguments(() => {}, undefined);
    doesntCheckAllArguments(() => {}, null);
    doesntCheckAllArguments(() => {}, 1);
    doesntCheckAllArguments((x, ...args) => check(args, [String]), 1, 'asdf', 'foo');
    doesntCheckAllArguments((x, y) => check(x, Boolean), true, false);

    // One "true" check doesn't count for all.
    doesntCheckAllArguments((x, y) => check(x, Boolean), true, true);

    // For non-primitives, we really do require that each arg gets checked.
    doesntCheckAllArguments((x, y) => {
      check(x, [Boolean]);
      check(x, [Boolean]);
    }, [true], [true]);

    // In an ideal world this test would fail, but we currently can't
    // differentiate between "two calls to check x, both of which are true" and
    // "check x and check y, both of which are true" (for any interned primitive
    // type).
    checksAllArguments((x, y) => {
      check(x, Boolean);
      check(x, Boolean);
    }, true, true);
  });

  it('Match error path', () => {
    const matchPath = (value, pattern, expectedPath) => {
      try {
        check(value, pattern);
      } catch (err) {

        // XXX just for FF 3.6, its JSON stringification prefers "\u000a" to "\n"
        err.path = err.path.replace(/\\u000a/, '\\n');
        if (err.path != expectedPath) {
          assert.fail(
            `Match.Error path mismatch: expected "${expectedPath}", got "${err.path}" ` +
            `for value ${JSON.stringify(value)} against pattern ${JSON.stringify(pattern)}`
          );
        }
      }
    };

    matchPath({ foo: [ { bar: 3 }, { bar: 'something' } ] }, { foo: [{ bar: Number }] }, 'foo[1].bar');

    // Complicated case with arrays, $, whitespace and quotes!
    matchPath([{ $FoO: { "bar baz\n\"'": 3 } }], [{ $FoO: { "bar baz\n\"'": String } }], "[0].$FoO[\"bar baz\\n\\\"'\"]");

    // Numbers only, can be accessed w/o quotes
    matchPath({ '1231': 123 }, { '1231': String }, '[1231]');
    matchPath({ '1234abcd': 123 }, { '1234abcd': String }, '[\"1234abcd\"]');
    matchPath({ $set: { people: 'nice' } }, { $set: { people: [String] } }, '$set.people');
    matchPath({ _underscore: 'should work' }, { _underscore: Number }, '_underscore');

    // Nested array looks nice
    matchPath([[['something', 'here'], []], [['string', 123]]], [[[String]]], '[1][0][1]');

    // Object nested in arrays should look nice, too!
    matchPath([[[{ foo: 'something' }, { foo: 'here'}],
            [{ foo: 'asdf' }]],
           [[{ foo: 123 }]]],
          [[[{ foo: String }]]], '[1][0][0].foo');

    // JS keyword
    matchPath({ 'return': 0 }, { 'return': String }, '[\"return\"]');
  });

  it('Match error message', () => {
    const matchMsg = (value, pattern, expectedMessage) => {
      try {
        check(value, pattern);
      } catch (err) {
        if (err.message !== `Match error: ${expectedMessage}`) {
          assert.fail(
            `Match.Error message mismatch: expected "Match error: ${expectedMessage}", ` +
            `got "${err.message}"`
          );
        }
      }
    };

    matchMsg(2, String, 'Expected string, got number');
    matchMsg({ key: 0 }, Number, 'Expected number, got object');
    matchMsg(null, Boolean, 'Expected boolean, got null');
    matchMsg('string', undefined, 'Expected undefined, got string');
    matchMsg(true, null, 'Expected null, got true');
    matchMsg({}, Match.ObjectIncluding({ bar: String }), "Missing key 'bar'");
    matchMsg(null, Object, 'Expected object, got null');
    matchMsg(null, Function, 'Expected function, got null');
    matchMsg('bar', 'foo', 'Expected foo, got "bar"');
    matchMsg(3.14, Match.Integer, 'Expected Integer, got 3.14');
    matchMsg(false, [Boolean], 'Expected array, got false');
    matchMsg([null, null], [String], 'Expected string, got null in field [0]');
    matchMsg(2, { key: 2 }, 'Expected object, got number');
    matchMsg(null, { key: 2 }, 'Expected object, got null');
    matchMsg(new Date, { key: 2 }, 'Expected plain object');

    const TestInstanceChild = function () {};
    const TestInstanceParent = function (child) {
      child._parent = this;
      this.child = child;
    };

    const testInstanceChild = new TestInstanceChild()
    const testInstanceParent = new TestInstanceParent(testInstanceChild);
    matchMsg(testInstanceChild, TestInstanceParent, `Expected ${(TestInstanceParent.name || 'particular constructor')}`);

    const circleFoo = {};
    const circleBar = {};
    circleFoo.bar = circleBar;
    circleBar.foo = circleFoo;
    matchMsg(circleFoo, null, 'Expected null, got object');
  });

  it('Match methods that return class instances can be called as constructors', () => {
    // Existing code sometimes uses these properties as constructors, so we can't
    // switch them to arrow functions or method shorthand.
    assert.ok(EJSON.equals(new Match.Optional(), Match.Optional()));
    assert.ok(EJSON.equals(new Match.Maybe(), Match.Maybe()));
    assert.ok(EJSON.equals(new Match.OneOf([1]), Match.OneOf([1]))); // Needs a non-empty array
    assert.ok(EJSON.equals(new Match.Where(), Match.Where()));
    assert.ok(EJSON.equals(new Match.ObjectIncluding(), Match.ObjectIncluding()));
    assert.ok(EJSON.equals(new Match.ObjectWithValues(), Match.ObjectWithValues()));
  });
});
