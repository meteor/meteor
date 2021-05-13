import Random from "./browser";

test("random ID with seeds", () => {
  // Deterministic with a specified seed, which should generate the
  // same sequence in all environments.
  //
  // For repeatable unit test failures using deterministic random
  // number sequences it's fine if a new Meteor release changes the
  // algorithm being used and it starts generating a different
  // sequence for a seed, as long as the sequence is consistent for
  // a particular release.
  const random = Random.createWithSeeds(0);
  expect(random.id()).toBe("cp9hWvhg8GSvuZ9os");
  expect(random.id()).toBe("3f3k6Xo7rrHCifQhR");
  expect(random.id()).toBe("shxDnjWWmnKPEoLhM");
  expect(random.id()).toBe("6QTjB8C5SEqhmz4ni");
});

// node crypto and window.crypto.getRandomValues() don't let us specify a seed,
// but at least test that the output is in the right format.
test("random format", () => {
  expect(Random.id().length).toBe(17);
  expect(Random.id(29).length).toBe(29);

  const numDigits = 9;
  const hexStr = Random.hexString(numDigits);
  expect(hexStr.length).toBe(numDigits);

  expect(() => {
    parseInt(hexStr, 16);
  }).not.toThrow();

  const randomFraction = Random.fraction();
  expect(randomFraction < 1.0).toBe(true);
  expect(randomFraction >= 0.0).toBe(true);

  expect(Random.secret().length).toBe(43);
  expect(Random.secret(13).length).toBe(13);
});

test("Alea is last resort", () => {
  const useGetRandomValues = !!(typeof window !== "undefined" &&
      window.crypto && window.crypto.getRandomValues);
  expect(Random.alea === undefined).toBe(useGetRandomValues);
});

test("createWithSeeds requires parameters", () => {
  expect(() => {
    Random.createWithSeeds();
  }).toThrow();
});
