import { Tinytest } from 'meteor/tinytest';
import { Minimongo } from 'meteor/minimongo';
import { match } from '../query/match';
import { parseSelector } from '../query/parse-selector';

const FIXTURES = [
  [{ a: 1 }, { a: 1 }],
  [{ a: { $gt: 5 } }, { a: 7 }],
  [{ a: { $gt: 5 } }, { a: 3 }],
  [{ a: { $in: [1, 2] } }, { a: 2 }],
  [{ $or: [{ a: 1 }, { b: 2 }] }, { b: 2 }],
  [{ name: /^a/i }, { name: 'Alice' }],
];

Tinytest.add('afs - query - match - parity with Minimongo.Matcher (raw input)', (test) => {
  for (const [sel, doc] of FIXTURES) {
    const got = match(doc, sel);
    const expected = new Minimongo.Matcher(sel).documentMatches(doc).result;
    test.equal(got, expected, `${JSON.stringify(sel)} on ${JSON.stringify(doc)}`);
  }
});

Tinytest.add('afs - query - match - parity with Minimongo.Matcher (parsed AST)', (test) => {
  for (const [sel, doc] of FIXTURES) {
    const ast = parseSelector(sel);
    const got = match(doc, ast);
    const expected = new Minimongo.Matcher(sel).documentMatches(doc).result;
    test.equal(got, expected);
  }
});

Tinytest.add('afs - query - match - reuses compiled matcher across calls', (test) => {
  const ast = parseSelector({ a: 1 });
  // First call compiles; subsequent calls hit the WeakMap cache. We can't
  // observe the cache directly, but verify both calls produce the same result.
  test.isTrue(match({ a: 1 }, ast));
  test.isTrue(match({ a: 1 }, ast));
  test.isFalse(match({ a: 2 }, ast));
});
