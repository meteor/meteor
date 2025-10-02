import { Tinytest } from "meteor/tinytest";
import { Random } from "meteor/random";

Tinytest.add("Random - TypeScript types - id", (test) => {
  const id1: string = Random.id();
  const id2: string = Random.id(10);
  test.equal(typeof id1, "string");
  test.equal(typeof id2, "string");
});

Tinytest.add("Random - TypeScript types - secret", (test) => {
  const secret1: string = Random.secret();
  const secret2: string = Random.secret(10);
  test.equal(typeof secret1, "string");
  test.equal(typeof secret2, "string");
});

Tinytest.add("Random - TypeScript types - fraction", (test) => {
  const frac: number = Random.fraction();
  test.equal(typeof frac, "number");
});

Tinytest.add("Random - TypeScript types - hexString", (test) => {
  const hex: string = Random.hexString(10);
  test.equal(typeof hex, "string");
});

Tinytest.add("Random - TypeScript types - choice with array", (test) => {
  const numbers = [1, 2, 3, 4, 5];
  const chosen: number | undefined = Random.choice(numbers);
  test.equal(typeof chosen === "number" || chosen === undefined, true);
});

Tinytest.add("Random - TypeScript types - choice with string", (test) => {
  const str = "abcdef";
  const chosen: string = Random.choice(str);
  test.equal(typeof chosen, "string");
});
