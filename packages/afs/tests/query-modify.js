import { Tinytest } from 'meteor/tinytest';
import { LocalCollection } from 'meteor/minimongo';
import { applyModifier } from '../query/apply-modifier';
import { parseModifier } from '../query/parse-modifier';

const FIXTURES = [
  { $set: { name: 'new' } },
  { $unset: { name: 1 } },
  { $inc: { count: 2 } },
  { $push: { tags: 'c' } },
  { $push: { tags: { $each: ['c', 'd'], $position: 0 } } },
  { $pull: { tags: 'a' } },
  { $addToSet: { tags: { $each: ['x', 'y'] } } },
  { name: 'replacement', age: 99 },          // replacement doc
];

const SEED = { _id: 'x', name: 'old', count: 0, tags: ['a', 'b'] };

Tinytest.add('afs - query - applyModifier - parity with LocalCollection._modify', (test) => {
  for (const m of FIXTURES) {
    const docA = EJSON.clone(SEED);
    const docB = EJSON.clone(SEED);
    let errA = null, errB = null;
    try { applyModifier(docA, m); }              catch (e) { errA = e; }
    try { LocalCollection._modify(docB, m); }    catch (e) { errB = e; }
    test.equal(!!errA, !!errB, `throw mismatch on ${JSON.stringify(m)}`);
    if (!errA && !errB) {
      test.isTrue(EJSON.equals(docA, docB),
        `state mismatch on ${JSON.stringify(m)}`);
    }
  }
});

Tinytest.add('afs - query - applyModifier - accepts pre-parsed AST', (test) => {
  const docA = EJSON.clone(SEED);
  const docB = EJSON.clone(SEED);
  applyModifier(docA, parseModifier({ $set: { name: 'X' } }));
  LocalCollection._modify(docB, { $set: { name: 'X' } });
  test.isTrue(EJSON.equals(docA, docB));
});

Tinytest.add('afs - query - applyModifier - isInsert option pass-through', (test) => {
  const docA = {};
  const docB = {};
  applyModifier(docA, { $setOnInsert: { name: 'init' } }, { isInsert: true });
  LocalCollection._modify(docB, { $setOnInsert: { name: 'init' } }, { isInsert: true });
  test.isTrue(EJSON.equals(docA, docB));
});
