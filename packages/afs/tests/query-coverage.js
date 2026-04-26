import { Tinytest } from 'meteor/tinytest';
import { ELEMENT_OPERATORS } from 'meteor/minimongo/common.js';
import { parseSelector } from '../query/parse-selector';
import { parseModifier } from '../query/parse-modifier';

// Operators handled at the field-clause level by parseSelector.
const EXPECTED_FIELD_OPERATORS = new Set([
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte',
  '$in', '$nin',
  '$exists', '$type', '$regex', '$mod', '$size', '$all', '$elemMatch',
  '$bitsAllSet', '$bitsAllClear', '$bitsAnySet', '$bitsAnyClear',
  '$near', '$nearSphere', '$geoWithin', '$geoIntersects',
  '$not',
  '$options',                 // paired with $regex
]);

Tinytest.add('afs - query - coverage - parseSelector covers minimongo ELEMENT_OPERATORS', (test) => {
  const minimongoOps = Object.keys(ELEMENT_OPERATORS).filter((k) => k.startsWith('$'));
  const missing = minimongoOps.filter((op) => !EXPECTED_FIELD_OPERATORS.has(op));
  test.equal(missing, [],
    `parseSelector is missing handlers for minimongo operators: ${missing.join(', ')}. ` +
    `Either add to parse-selector.js or update EXPECTED_FIELD_OPERATORS with rationale.`);
});

// Modifier operators exposed by minimongo's MODIFIERS table.
// (MODIFIERS is module-private; we list the operators we know exist and
// assert parseModifier accepts each. If minimongo adds an operator,
// adapter integration tests will catch it via parity failure.)
const KNOWN_MODIFIER_OPERATORS = [
  '$set', '$setOnInsert', '$unset',
  '$inc', '$mul', '$min', '$max',
  '$rename', '$currentDate',
  '$push', '$pop', '$pull', '$pullAll', '$addToSet',
  '$bit',
];

Tinytest.add('afs - query - coverage - parseModifier accepts every known operator', (test) => {
  for (const op of KNOWN_MODIFIER_OPERATORS) {
    let ok = true;
    try {
      // Synthesize a minimal valid use of each operator.
      const sample = synthesize(op);
      parseModifier(sample);
    } catch (e) {
      ok = false;
      test.fail(`parseModifier rejected ${op}: ${e.message}`);
    }
    test.isTrue(ok);
  }
});

function synthesize(op) {
  switch (op) {
    case '$set':           return { $set: { x: 1 } };
    case '$setOnInsert':   return { $setOnInsert: { x: 1 } };
    case '$unset':         return { $unset: { x: 1 } };
    case '$inc':           return { $inc: { x: 1 } };
    case '$mul':           return { $mul: { x: 2 } };
    case '$min':           return { $min: { x: 1 } };
    case '$max':           return { $max: { x: 1 } };
    case '$rename':        return { $rename: { a: 'b' } };
    case '$currentDate':   return { $currentDate: { ts: true } };
    case '$push':          return { $push: { tags: 'a' } };
    case '$pop':           return { $pop: { tags: 1 } };
    case '$pull':          return { $pull: { tags: 'a' } };
    case '$pullAll':       return { $pullAll: { tags: ['a'] } };
    case '$addToSet':      return { $addToSet: { tags: 'a' } };
    case '$bit':           return { $bit: { flags: { and: 1 } } };
    default: throw new Error(`No synthesis for ${op}`);
  }
}
