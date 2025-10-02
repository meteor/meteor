import { Tinytest } from "meteor/tinytest";
import { check, Match } from "meteor/check";

Tinytest.add("Check - TypeScript types - basic check function", (test) => {
  const value = "hello";
  check(value, String);
  // After check assertion, TypeScript knows value is a string
  const upper: string = value.toUpperCase();
  test.equal(upper, "HELLO");
});

Tinytest.add("Check - TypeScript types - Match.test with primitives", (test) => {
  const value: unknown = 42;

  if (Match.test(value, Number)) {
    // TypeScript should narrow the type here
    const doubled: number = value * 2;
    test.equal(doubled, 84);
  }
});

Tinytest.add("Check - TypeScript types - Match.Maybe", (test) => {
  const pattern = Match.Maybe(String);

  test.equal(Match.test(null, pattern), true);
  test.equal(Match.test(undefined, pattern), true);
  test.equal(Match.test("hello", pattern), true);
  test.equal(Match.test(123, pattern), false);
});

Tinytest.add("Check - TypeScript types - Match.Optional", (test) => {
  const pattern = Match.Optional(Number);

  test.equal(Match.test(undefined, pattern), true);
  test.equal(Match.test(42, pattern), true);
  test.equal(Match.test(null, pattern), false);
});

Tinytest.add("Check - TypeScript types - Match.OneOf", (test) => {
  const pattern = Match.OneOf(String, Number);

  test.equal(Match.test("hello", pattern), true);
  test.equal(Match.test(42, pattern), true);
  test.equal(Match.test(true, pattern), false);
});

Tinytest.add("Check - TypeScript types - Match.ObjectIncluding", (test) => {
  const pattern = Match.ObjectIncluding({ name: String });

  test.equal(Match.test({ name: "John" }, pattern), true);
  test.equal(Match.test({ name: "John", age: 30 }, pattern), true);
  test.equal(Match.test({ age: 30 }, pattern), false);
});

Tinytest.add("Check - TypeScript types - Match.Where", (test) => {
  const isPositive = Match.Where((x: any): x is number => {
    return typeof x === "number" && x > 0;
  });

  test.equal(Match.test(42, isPositive), true);
  test.equal(Match.test(-5, isPositive), false);
  test.equal(Match.test("hello", isPositive), false);
});

Tinytest.add("Check - TypeScript types - Match.Integer", (test) => {
  test.equal(Match.test(42, Match.Integer), true);
  test.equal(Match.test(42.5, Match.Integer), false);
  test.equal(Match.test(NaN, Match.Integer), false);
  test.equal(Match.test(Infinity, Match.Integer), false);
});

Tinytest.add("Check - TypeScript types - Match.Any", (test) => {
  test.equal(Match.test("hello", Match.Any), true);
  test.equal(Match.test(42, Match.Any), true);
  test.equal(Match.test(null, Match.Any), true);
  test.equal(Match.test(undefined, Match.Any), true);
});

Tinytest.add("Check - TypeScript types - array patterns", (test) => {
  const pattern = [Number];

  test.equal(Match.test([1, 2, 3], pattern), true);
  test.equal(Match.test([1, "2", 3], pattern), false);
  test.equal(Match.test([], pattern), true);
});

Tinytest.add("Check - TypeScript types - object patterns", (test) => {
  const pattern = { name: String, age: Number };

  test.equal(Match.test({ name: "John", age: 30 }, pattern), true);
  test.equal(Match.test({ name: "John", age: "30" }, pattern), false);
  test.equal(Match.test({ name: "John" }, pattern), false);
});

Tinytest.add("Check - TypeScript types - check with throwAllErrors option", (test) => {
  const value = { name: "John", age: 30 };
  check(value, { name: String, age: Number }, { throwAllErrors: false });
  test.equal(value.name, "John");
});
