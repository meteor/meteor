import { Tinytest } from 'meteor/tinytest';
import { Minimongo, LocalCollection } from 'meteor/minimongo';
import { parseSelector } from '../query/parse-selector';
import { parseModifier } from '../query/parse-modifier';
import { astToRawSelector, astToRawModifier } from '../query/round-trip';

const SELECTOR_FIXTURES = [
  {},
  { _id: 'abc' },
  { name: 'alice' },
  { age: { $gt: 5 } },
  { age: { $gt: 5, $lt: 10 } },
  { tags: { $in: ['a', 'b'] } },
  { tags: { $nin: ['a'] } },
  { x: { $exists: true } },
  { name: /^a/i },
  { items: { $elemMatch: { qty: { $gte: 1 } } } },
  { $and: [{ a: 1 }, { b: 2 }] },
  { $or: [{ a: 1 }, { b: 2 }] },
  { a: { $not: { $gt: 5 } } },
  { 'profile.name': 'alice' },
];

const DOC_CORPUS = [
  { _id: 'abc', name: 'alice', age: 7, tags: ['a'], items: [{ qty: 2 }], profile: { name: 'alice' } },
  { _id: 'def', name: 'bob',   age: 3, tags: ['b', 'c'] },
  { _id: 'ghi', age: 12 },
  { _id: 'jkl', x: null },
];

Tinytest.add('afs - query - round-trip - selector parity vs Minimongo.Matcher', (test) => {
  for (const s of SELECTOR_FIXTURES) {
    const raw = astToRawSelector(parseSelector(s));
    const aMatcher = new Minimongo.Matcher(raw);
    const bMatcher = new Minimongo.Matcher(s);
    for (const doc of DOC_CORPUS) {
      test.equal(
        aMatcher.documentMatches(doc).result,
        bMatcher.documentMatches(doc).result,
        `Selector ${JSON.stringify(s)} on doc ${JSON.stringify(doc)}`
      );
    }
  }
});

const MODIFIER_FIXTURES = [
  { $set: { name: 'updated' } },
  { $unset: { x: 1 } },
  { $inc: { count: 1 } },
  { $push: { tags: 'new' } },
  { $push: { tags: { $each: ['a', 'b'], $position: 0 } } },
  { $push: { items: { $each: [{ score: 3 }, { score: 1 }], $sort: { score: 1 } } } },
  { $push: { items: { $each: [{ score: 3 }, { score: 1 }], $sort: { score: -1 }, $slice: 2 } } },
  { $pull: { tags: 'a' } },
  { $pullAll: { tags: ['a', 'b'] } },
  { $addToSet: { tags: { $each: ['c', 'd'] } } },
  { $rename: { 'a.b': 'x.y' } },
  { $bit: { flags: { and: 5 } } },
  { name: 'replacement', age: 0 },          // replacement doc
];

Tinytest.add('afs - query - round-trip - modifier parity vs LocalCollection._modify', (test) => {
  for (const m of MODIFIER_FIXTURES) {
    const seedDoc = { _id: 'x', a: { b: 'old' }, count: 0, tags: ['a', 'b'], flags: 7 };
    const docA = EJSON.clone(seedDoc);
    const docB = EJSON.clone(seedDoc);
    const ast = parseModifier(m);
    const raw = ast.isReplacement ? ast.replacement : astToRawModifier(ast);

    let errA = null, errB = null;
    try { LocalCollection._modify(docA, raw); } catch (e) { errA = e; }
    try { LocalCollection._modify(docB, m); }   catch (e) { errB = e; }

    if (errA || errB) {
      test.equal(!!errA, !!errB,
        `Mismatched throw on ${JSON.stringify(m)}: A=${errA?.message}, B=${errB?.message}`);
      continue;
    }
    test.isTrue(EJSON.equals(docA, docB),
      `Mismatch on ${JSON.stringify(m)}: A=${JSON.stringify(docA)}, B=${JSON.stringify(docB)}`);
  }
});
