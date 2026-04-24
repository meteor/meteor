import { EJSON } from "./ejson";
import EJSONTest from "./custom_models_for_tests";

Tinytest.add("ejson - keyOrderSensitive", (test) => {
  test.isTrue(
    EJSON.equals(
      {
        a: { b: 1, c: 2 },
        d: { e: 3, f: 4 },
      },
      {
        d: { f: 4, e: 3 },
        a: { c: 2, b: 1 },
      },
    ),
  );

  test.isFalse(
    EJSON.equals(
      {
        a: { b: 1, c: 2 },
        d: { e: 3, f: 4 },
      },
      {
        d: { f: 4, e: 3 },
        a: { c: 2, b: 1 },
      },
      { keyOrderSensitive: true },
    ),
  );

  test.isFalse(
    EJSON.equals(
      {
        a: { b: 1, c: 2 },
        d: { e: 3, f: 4 },
      },
      {
        a: { c: 2, b: 1 },
        d: { f: 4, e: 3 },
      },
      { keyOrderSensitive: true },
    ),
  );
  test.isFalse(EJSON.equals({ a: {} }, { a: { b: 2 } }, { keyOrderSensitive: true }));
  test.isFalse(EJSON.equals({ a: { b: 2 } }, { a: {} }, { keyOrderSensitive: true }));
});

Tinytest.add("ejson - nesting and literal", (test) => {
  const d = new Date();
  const obj = { $date: d };
  const eObj = EJSON.toJSONValue(obj);
  const roundTrip = EJSON.fromJSONValue(eObj);
  test.equal(obj, roundTrip);
});

Tinytest.add("ejson - some equality tests", (test) => {
  test.isTrue(EJSON.equals({ a: 1, b: 2, c: 3 }, { a: 1, c: 3, b: 2 }));
  test.isFalse(EJSON.equals({ a: 1, b: 2 }, { a: 1, c: 3, b: 2 }));
  test.isFalse(EJSON.equals({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 }));
  test.isFalse(EJSON.equals({ a: 1, b: 2, c: 3 }, { a: 1, c: 3, b: 4 }));
  test.isFalse(EJSON.equals({ a: {} }, { a: { b: 2 } }));
  test.isFalse(EJSON.equals({ a: { b: 2 } }, { a: {} }));
  // XXX: Object and Array were previously mistaken, which is why
  // we add some extra tests for them here
  test.isTrue(EJSON.equals([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]));
  test.isFalse(EJSON.equals([1, 2, 3, 4, 5], [1, 2, 3, 4]));
  test.isFalse(EJSON.equals([1, 2, 3, 4], { 0: 1, 1: 2, 2: 3, 3: 4 }));
  test.isFalse(EJSON.equals({ 0: 1, 1: 2, 2: 3, 3: 4 }, [1, 2, 3, 4]));
  test.isFalse(EJSON.equals({}, []));
  test.isFalse(EJSON.equals([], {}));
});

Tinytest.add("ejson - equality and falsiness", (test) => {
  test.isTrue(EJSON.equals(null, null));
  test.isTrue(EJSON.equals(undefined, undefined));
  test.isFalse(EJSON.equals({ foo: "foo" }, null));
  test.isFalse(EJSON.equals(null, { foo: "foo" }));
  test.isFalse(EJSON.equals(undefined, { foo: "foo" }));
  test.isFalse(EJSON.equals({ foo: "foo" }, undefined));
});

Tinytest.add("ejson - equals type-mismatch early exit", (test) => {
  // Cross-type primitives: typeof a !== typeof b → false
  test.isFalse(EJSON.equals("hello", 42));
  test.isFalse(EJSON.equals(42, "hello"));
  test.isFalse(EJSON.equals(1, true));
  test.isFalse(EJSON.equals(true, 1));
  test.isFalse(EJSON.equals("true", true));
  test.isFalse(EJSON.equals(true, "true"));
  test.isFalse(EJSON.equals("1", 1));
  test.isFalse(EJSON.equals(1, "1"));

  // Falsy cross-type: both are falsy but different types
  test.isFalse(EJSON.equals(0, false));
  test.isFalse(EJSON.equals(false, 0));
  test.isFalse(EJSON.equals("", 0));
  test.isFalse(EJSON.equals(0, ""));
  test.isFalse(EJSON.equals("", false));
  test.isFalse(EJSON.equals(false, ""));

  // null/undefined vs primitives (typeof null is 'object', differs from 'number'/'string')
  test.isFalse(EJSON.equals(null, 0));
  test.isFalse(EJSON.equals(0, null));
  test.isFalse(EJSON.equals(null, ""));
  test.isFalse(EJSON.equals("", null));
  test.isFalse(EJSON.equals(null, false));
  test.isFalse(EJSON.equals(false, null));
  test.isFalse(EJSON.equals(undefined, 0));
  test.isFalse(EJSON.equals(0, undefined));
  test.isFalse(EJSON.equals(undefined, ""));
  test.isFalse(EJSON.equals("", undefined));
  test.isFalse(EJSON.equals(undefined, false));
  test.isFalse(EJSON.equals(false, undefined));
  test.isFalse(EJSON.equals(null, undefined));
  test.isFalse(EJSON.equals(undefined, null));
});

Tinytest.add("ejson - equals same-type primitives", (test) => {
  // Same-type, same-value → caught by a === b
  test.isTrue(EJSON.equals(0, 0));
  test.isTrue(EJSON.equals(1, 1));
  test.isTrue(EJSON.equals(-1, -1));
  test.isTrue(EJSON.equals("", ""));
  test.isTrue(EJSON.equals("hello", "hello"));
  test.isTrue(EJSON.equals(true, true));
  test.isTrue(EJSON.equals(false, false));

  // Same-type, different-value → typeof a !== 'object', then NaN check returns false
  test.isFalse(EJSON.equals(1, 2));
  test.isFalse(EJSON.equals("a", "b"));
  test.isFalse(EJSON.equals(true, false));
  test.isFalse(EJSON.equals(false, true));
  test.isFalse(EJSON.equals(0, 1));
  test.isTrue(EJSON.equals(0, -0)); // 0 === -0 in JS, caught by a === b
});

Tinytest.add("ejson - equals null vs object", (test) => {
  // Both typeof 'object', but one is null
  test.isFalse(EJSON.equals(null, {}));
  test.isFalse(EJSON.equals({}, null));
  test.isFalse(EJSON.equals(null, []));
  test.isFalse(EJSON.equals([], null));
  test.isFalse(EJSON.equals(null, new Date()));
  test.isFalse(EJSON.equals(new Date(), null));
});

Tinytest.add("ejson - equals nested falsy and type-mismatch fields", (test) => {
  // Objects with falsy fields of different types
  test.isFalse(EJSON.equals({ a: 0 }, { a: false }));
  test.isFalse(EJSON.equals({ a: "" }, { a: 0 }));
  test.isFalse(EJSON.equals({ a: "" }, { a: false }));
  test.isFalse(EJSON.equals({ a: null }, { a: undefined }));
  test.isFalse(EJSON.equals({ a: null }, { a: 0 }));
  test.isFalse(EJSON.equals({ a: null }, { a: "" }));
  test.isFalse(EJSON.equals({ a: null }, { a: false }));

  // Objects with same falsy values should be equal
  test.isTrue(EJSON.equals({ a: 0 }, { a: 0 }));
  test.isTrue(EJSON.equals({ a: "" }, { a: "" }));
  test.isTrue(EJSON.equals({ a: false }, { a: false }));
  test.isTrue(EJSON.equals({ a: null }, { a: null }));
  test.isTrue(EJSON.equals({ a: undefined }, { a: undefined }));

  // Deeply nested type mismatches
  test.isFalse(EJSON.equals({ a: { b: { c: 0 } } }, { a: { b: { c: false } } }));
  test.isFalse(EJSON.equals({ a: { b: { c: null } } }, { a: { b: { c: undefined } } }));
  test.isTrue(EJSON.equals({ a: { b: { c: 0 } } }, { a: { b: { c: 0 } } }));

  // Arrays with type-mismatched elements
  test.isFalse(EJSON.equals([0, 1, 2], [false, 1, 2]));
  test.isFalse(EJSON.equals([0, "", 2], [0, false, 2]));
  test.isFalse(EJSON.equals([null], [undefined]));
  test.isTrue(EJSON.equals([0, "", null], [0, "", null]));
});

Tinytest.add("ejson - NaN and Inf", (test) => {
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

  test.isTrue(EJSON.equals(EJSON.parse('{"a": {"$InfNaN": 1}}'), { a: Infinity }));
  test.isTrue(EJSON.equals(EJSON.parse('{"a": {"$InfNaN": 0}}'), { a: NaN }));
});

Tinytest.add("ejson - toJSONValue primitives pass through unchanged", (test) => {
  test.equal(EJSON.toJSONValue(42), 42);
  test.equal(EJSON.toJSONValue("hello"), "hello");
  test.equal(EJSON.toJSONValue(true), true);
  test.equal(EJSON.toJSONValue(false), false);
  test.equal(EJSON.toJSONValue(null), null);
  test.equal(EJSON.toJSONValue(undefined), undefined);
  test.equal(EJSON.toJSONValue(0), 0);
  test.equal(EJSON.toJSONValue(""), "");
});

Tinytest.add("ejson - toJSONValue converts Date to {$date}", (test) => {
  const d = new Date("2024-06-15T12:00:00Z");
  const result = EJSON.toJSONValue(d);
  test.equal(result, { $date: d.getTime() });
});

Tinytest.add("ejson - toJSONValue converts NaN and Infinity", (test) => {
  test.equal(EJSON.toJSONValue(NaN), { $InfNaN: 0 });
  test.equal(EJSON.toJSONValue(Infinity), { $InfNaN: 1 });
  test.equal(EJSON.toJSONValue(-Infinity), { $InfNaN: -1 });
});

Tinytest.add("ejson - toJSONValue handles pure-primitive objects", (test) => {
  const obj = { a: 1, b: "hello", c: true, d: null };
  const result = EJSON.toJSONValue(obj);
  test.equal(result, { a: 1, b: "hello", c: true, d: null });
});

Tinytest.add("ejson - toJSONValue converts nested Dates", (test) => {
  const d = new Date("2024-01-01");
  const obj = { name: "test", createdAt: d, meta: { updatedAt: d } };
  const result = EJSON.toJSONValue(obj);
  test.equal(result, {
    name: "test",
    createdAt: { $date: d.getTime() },
    meta: { updatedAt: { $date: d.getTime() } },
  });
});

Tinytest.add("ejson - toJSONValue handles arrays", (test) => {
  // Pure-primitive array
  const arr = [1, "two", true, null];
  const result = EJSON.toJSONValue(arr);
  test.equal(result, [1, "two", true, null]);

  // Array with a Date
  const d = new Date();
  const arrWithDate = ["a", d, "b"];
  const result2 = EJSON.toJSONValue(arrWithDate);
  test.equal(result2, ["a", { $date: d.getTime() }, "b"]);

  // Empty array
  test.equal(EJSON.toJSONValue([]), []);
});

Tinytest.add("ejson - toJSONValue handles NaN/Infinity inside objects and arrays", (test) => {
  const obj = { a: 1, b: NaN, c: Infinity, d: -Infinity, e: "normal" };
  const result = EJSON.toJSONValue(obj);
  test.equal(result, {
    a: 1,
    b: { $InfNaN: 0 },
    c: { $InfNaN: 1 },
    d: { $InfNaN: -1 },
    e: "normal",
  });

  const arr = [NaN, 42, Infinity];
  const result2 = EJSON.toJSONValue(arr);
  test.equal(result2, [{ $InfNaN: 0 }, 42, { $InfNaN: 1 }]);
});

Tinytest.add("ejson - toJSONValue escapes $-prefixed keys that look like EJSON types", (test) => {
  const obj = { $date: 12345 };
  const result = EJSON.toJSONValue(obj);
  // Should be wrapped in $escape to prevent misinterpretation
  test.isTrue("$escape" in result);
  test.equal(result.$escape.$date, 12345);
});

Tinytest.add("ejson - fromJSONValue primitives pass through unchanged", (test) => {
  test.equal(EJSON.fromJSONValue(42), 42);
  test.equal(EJSON.fromJSONValue("hello"), "hello");
  test.equal(EJSON.fromJSONValue(true), true);
  test.equal(EJSON.fromJSONValue(false), false);
  test.equal(EJSON.fromJSONValue(null), null);
  test.equal(EJSON.fromJSONValue(0), 0);
  test.equal(EJSON.fromJSONValue(""), "");
});

Tinytest.add("ejson - fromJSONValue converts {$date} to Date", (test) => {
  const ts = 1718452800000;
  const result = EJSON.fromJSONValue({ $date: ts });
  test.instanceOf(result, Date);
  test.equal(result.getTime(), ts);
});

Tinytest.add("ejson - fromJSONValue converts {$InfNaN} back", (test) => {
  test.isTrue(Number.isNaN(EJSON.fromJSONValue({ $InfNaN: 0 })));
  test.equal(EJSON.fromJSONValue({ $InfNaN: 1 }), Infinity);
  test.equal(EJSON.fromJSONValue({ $InfNaN: -1 }), -Infinity);
});

Tinytest.add("ejson - fromJSONValue handles pure-primitive objects", (test) => {
  const obj = { a: 1, b: "hello", c: true, d: null };
  const result = EJSON.fromJSONValue(obj);
  test.equal(result, { a: 1, b: "hello", c: true, d: null });
});

Tinytest.add("ejson - fromJSONValue converts nested {$date} values", (test) => {
  const ts = Date.now();
  const obj = { name: "test", createdAt: { $date: ts }, meta: { updatedAt: { $date: ts } } };
  const result = EJSON.fromJSONValue(obj);
  test.equal(result.name, "test");
  test.instanceOf(result.createdAt, Date);
  test.equal(result.createdAt.getTime(), ts);
  test.instanceOf(result.meta.updatedAt, Date);
  test.equal(result.meta.updatedAt.getTime(), ts);
});

Tinytest.add("ejson - fromJSONValue handles arrays with EJSON types", (test) => {
  const ts = Date.now();
  const arr = ["a", { $date: ts }, "b"];
  const result = EJSON.fromJSONValue(arr);
  test.equal(result[0], "a");
  test.instanceOf(result[1], Date);
  test.equal(result[1].getTime(), ts);
  test.equal(result[2], "b");
  test.length(result, 3);

  // Pure-primitive array
  test.equal(EJSON.fromJSONValue([1, 2, 3]), [1, 2, 3]);

  // Empty array
  test.equal(EJSON.fromJSONValue([]), []);
});

Tinytest.add("ejson - fromJSONValue unescapes $escape wrapper", (test) => {
  const input = { $escape: { $date: 12345 } };
  const result = EJSON.fromJSONValue(input);
  test.equal(result, { $date: 12345 });
  test.isFalse("$escape" in result);
});

Tinytest.add("ejson - toJSONValue/fromJSONValue round-trip", (test) => {
  const d = new Date();
  const cases = [
    42,
    "hello",
    true,
    null,
    { a: 1, b: "two" },
    [1, 2, 3],
    d,
    NaN,
    Infinity,
    -Infinity,
    { name: "test", ts: d, scores: [1, 2, 3] },
    { nested: { deep: { date: d, val: 42 } } },
    [d, "a", { x: d }],
    { $date: 12345 }, // $-prefixed key → escape/unescape round-trip
    { a: NaN, b: Infinity, c: -Infinity, d: "normal" },
    {}, // empty object
    [], // empty array
  ];

  cases.forEach((original) => {
    const json = EJSON.toJSONValue(original);
    const restored = EJSON.fromJSONValue(json);
    test.isTrue(
      EJSON.equals(original, restored),
      `Round-trip failed for: ${EJSON.stringify(original)}`,
    );
  });
});

Tinytest.add("ejson - toJSONValue does not mutate the input", (test) => {
  const d = new Date();
  const obj = { name: "test", createdAt: d, tags: ["a", "b"] };
  const originalName = obj.name;
  const originalDate = obj.createdAt;
  const originalTags = obj.tags;

  EJSON.toJSONValue(obj);

  // Original object must be untouched
  test.equal(obj.name, originalName);
  test.equal(obj.createdAt, originalDate);
  test.equal(obj.tags, originalTags);
  test.instanceOf(obj.createdAt, Date);
  test.equal(obj.tags[0], "a");
});

Tinytest.add("ejson - clone", (test) => {
  const cloneTest = (x, identical) => {
    const y = EJSON.clone(x);
    test.isTrue(EJSON.equals(x, y));
    test.equal(x === y, !!identical);
  };
  cloneTest(null, true);
  cloneTest(undefined, true);
  cloneTest(42, true);
  cloneTest("asdf", true);
  cloneTest([1, 2, 3]);
  cloneTest([1, "fasdf", { foo: 42 }]);
  cloneTest({ x: 42, y: "asdf" });

  function testCloneArgs(/*arguments*/) {
    const clonedArgs = EJSON.clone(arguments);
    test.equal(clonedArgs, [1, 2, "foo", [4]]);
  }
  testCloneArgs(1, 2, "foo", [4]);
});

Tinytest.add("ejson - stringify", (test) => {
  test.equal(EJSON.stringify(null), "null");
  test.equal(EJSON.stringify(true), "true");
  test.equal(EJSON.stringify(false), "false");
  test.equal(EJSON.stringify(123), "123");
  test.equal(EJSON.stringify("abc"), '"abc"');

  test.equal(EJSON.stringify([1, 2, 3]), "[1,2,3]");
  test.equal(EJSON.stringify([1, 2, 3], { indent: true }), "[\n  1,\n  2,\n  3\n]");
  test.equal(EJSON.stringify([1, 2, 3], { canonical: false }), "[1,2,3]");
  test.equal(
    EJSON.stringify([1, 2, 3], { indent: true, canonical: false }),
    "[\n  1,\n  2,\n  3\n]",
  );

  test.equal(EJSON.stringify([1, 2, 3], { indent: 4 }), "[\n    1,\n    2,\n    3\n]");
  test.equal(EJSON.stringify([1, 2, 3], { indent: "--" }), "[\n--1,\n--2,\n--3\n]");

  test.equal(
    EJSON.stringify({ b: [2, { d: 4, c: 3 }], a: 1 }, { canonical: true }),
    '{"a":1,"b":[2,{"c":3,"d":4}]}',
  );
  test.equal(
    EJSON.stringify(
      { b: [2, { d: 4, c: 3 }], a: 1 },
      {
        indent: true,
        canonical: true,
      },
    ),
    "{\n" +
      '  "a": 1,\n' +
      '  "b": [\n' +
      "    2,\n" +
      "    {\n" +
      '      "c": 3,\n' +
      '      "d": 4\n' +
      "    }\n" +
      "  ]\n" +
      "}",
  );
  test.equal(
    EJSON.stringify({ b: [2, { d: 4, c: 3 }], a: 1 }, { canonical: false }),
    '{"b":[2,{"d":4,"c":3}],"a":1}',
  );
  test.equal(
    EJSON.stringify({ b: [2, { d: 4, c: 3 }], a: 1 }, { indent: true, canonical: false }),
    "{\n" +
      '  "b": [\n' +
      "    2,\n" +
      "    {\n" +
      '      "d": 4,\n' +
      '      "c": 3\n' +
      "    }\n" +
      "  ],\n" +
      '  "a": 1\n' +
      "}",
  );

  test.throws(() => {
    const col = new Mongo.Collection("test");
    EJSON.stringify(col);
  }, /Converting circular structure to JSON/);
});

Tinytest.add("ejson - parse", (test) => {
  test.equal(EJSON.parse("[1,2,3]"), [1, 2, 3]);
  test.throws(() => {
    EJSON.parse(null);
  }, /argument should be a string/);
});

Tinytest.add("ejson - regexp", (test) => {
  test.equal(EJSON.stringify(/foo/gi), '{"$regexp":"foo","$flags":"gi"}');
  const obj = { $regexp: "foo", $flags: "gi" };

  const eObj = EJSON.toJSONValue(obj);
  const roundTrip = EJSON.fromJSONValue(eObj);
  test.equal(obj, roundTrip);
});

Tinytest.add("ejson - custom types", (test) => {
  const testSameConstructors = (someObj, compareWith) => {
    test.equal(someObj.constructor, compareWith.constructor);
    if (typeof someObj === "object") {
      Object.keys(someObj).forEach((key) => {
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

  const a = new EJSONTest.Address("Montreal", "Quebec");
  testCustomObject({ address: a });
  // Test that difference is detected even if they
  // have similar toJSONValue results:
  const nakedA = { city: "Montreal", state: "Quebec" };
  test.notEqual(nakedA, a);
  test.notEqual(a, nakedA);
  const holder = new EJSONTest.Holder(nakedA);
  test.equal(holder.toJSONValue(), a.toJSONValue()); // sanity check
  test.notEqual(holder, a);
  test.notEqual(a, holder);

  const d = new Date();
  const obj = new EJSONTest.Person("John Doe", d, a);
  testCustomObject(obj);

  // Test clone is deep:
  const clone = EJSON.clone(obj);
  clone.address.city = "Sherbrooke";
  test.notEqual(obj, clone);
});

// Verify objects with a property named "length" can be handled by the EJSON
// API properly (see https://github.com/meteor/meteor/issues/5175).
Tinytest.add('ejson - handle objects with properties named "length"', (test) => {
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

  test.isFalse(EJSON.isBinary(widget));

  const widget2 = new Widget();
  test.isTrue(widget, widget2);

  const clonedWidget = EJSON.clone(widget);
  test.equal(widget, clonedWidget);
});
