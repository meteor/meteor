import { Tinytest } from 'meteor/tinytest';
import { parseSelector } from '../query/parse-selector';
import { parseModifier } from '../query/parse-modifier';
import { parseSort } from '../query/parse-sort';
import { parseProjection } from '../query/parse-projection';
import { AST, PRED, MOD, isAST } from '../query/ast';
import { ParseError } from '../query/errors';

// ---------------------------------------------------------------------------
// parseSelector — top-level shapes
// ---------------------------------------------------------------------------

Tinytest.add('afs - query - parseSelector - empty selector → empty And', (test) => {
  const ast = parseSelector({});
  test.equal(ast, { type: AST.AND, clauses: [] });
});

Tinytest.add('afs - query - parseSelector - shorthand _id string', (test) => {
  const ast = parseSelector('abc123');
  test.equal(ast, {
    type: AST.AND,
    clauses: [{
      type: AST.FIELD,
      path: ['_id'],
      predicate: { kind: PRED.EQ, value: 'abc123' },
    }],
  });
});

Tinytest.add('afs - query - parseSelector - single equality field', (test) => {
  const ast = parseSelector({ name: 'alice' });
  test.equal(ast, {
    type: AST.AND,
    clauses: [{
      type: AST.FIELD,
      path: ['name'],
      predicate: { kind: PRED.EQ, value: 'alice' },
    }],
  });
});

Tinytest.add('afs - query - parseSelector - dotted path → segmented', (test) => {
  const ast = parseSelector({ 'profile.name': 'alice' });
  test.equal(ast.clauses[0].path, ['profile', 'name']);
});

Tinytest.add('afs - query - parseSelector - comparison operators', (test) => {
  const cases = [
    ['$eq', PRED.EQ], ['$ne', PRED.NE],
    ['$gt', PRED.GT], ['$gte', PRED.GTE],
    ['$lt', PRED.LT], ['$lte', PRED.LTE],
  ];
  for (const [op, kind] of cases) {
    const ast = parseSelector({ age: { [op]: 5 } });
    test.equal(ast.clauses[0].predicate, { kind, value: 5 });
  }
});

Tinytest.add('afs - query - parseSelector - $in / $nin', (test) => {
  const ast = parseSelector({ tag: { $in: ['a', 'b'] } });
  test.equal(ast.clauses[0].predicate, { kind: PRED.IN, values: ['a', 'b'] });

  const ast2 = parseSelector({ tag: { $nin: ['a'] } });
  test.equal(ast2.clauses[0].predicate, { kind: PRED.NIN, values: ['a'] });
});

Tinytest.add('afs - query - parseSelector - $exists / $type / $size / $mod', (test) => {
  test.equal(parseSelector({ x: { $exists: true } }).clauses[0].predicate,
             { kind: PRED.EXISTS, value: true });
  test.equal(parseSelector({ x: { $type: 'string' } }).clauses[0].predicate,
             { kind: PRED.TYPE, bsonType: 'string' });
  test.equal(parseSelector({ x: { $size: 3 } }).clauses[0].predicate,
             { kind: PRED.SIZE, value: 3 });
  test.equal(parseSelector({ x: { $mod: [3, 1] } }).clauses[0].predicate,
             { kind: PRED.MOD, divisor: 3, remainder: 1 });
});

Tinytest.add('afs - query - parseSelector - $regex shorthand', (test) => {
  const ast = parseSelector({ name: /^a/i });
  test.equal(ast.clauses[0].predicate, { kind: PRED.REGEX, source: '^a', flags: 'i' });
});

Tinytest.add('afs - query - parseSelector - $regex object form', (test) => {
  const ast = parseSelector({ name: { $regex: '^a', $options: 'i' } });
  test.equal(ast.clauses[0].predicate, { kind: PRED.REGEX, source: '^a', flags: 'i' });
});

Tinytest.add('afs - query - parseSelector - $all / $elemMatch', (test) => {
  test.equal(parseSelector({ tags: { $all: ['a', 'b'] } }).clauses[0].predicate,
             { kind: PRED.ALL, values: ['a', 'b'] });
  const em = parseSelector({ items: { $elemMatch: { qty: { $gt: 5 } } } }).clauses[0].predicate;
  test.equal(em.kind, PRED.ELEM_MATCH);
  test.isTrue(isAST(em.inner));
});

Tinytest.add('afs - query - parseSelector - $bits operators', (test) => {
  const cases = [
    ['$bitsAllSet', 'AllSet'], ['$bitsAllClear', 'AllClear'],
    ['$bitsAnySet', 'AnySet'], ['$bitsAnyClear', 'AnyClear'],
  ];
  for (const [op, expected] of cases) {
    const ast = parseSelector({ flags: { [op]: 5 } });
    test.equal(ast.clauses[0].predicate, { kind: PRED.BITS, op: expected, mask: 5 });
  }
});

Tinytest.add('afs - query - parseSelector - logical $and', (test) => {
  const ast = parseSelector({ $and: [{ a: 1 }, { b: 2 }] });
  test.equal(ast.type, AST.AND);
  test.equal(ast.clauses.length, 2);
  test.equal(ast.clauses[0].type, AST.AND);
  test.equal(ast.clauses[0].clauses[0].path, ['a']);
});

Tinytest.add('afs - query - parseSelector - logical $or / $nor', (test) => {
  const orAST = parseSelector({ $or: [{ a: 1 }, { b: 2 }] });
  test.equal(orAST.clauses[0].type, AST.OR);
  const norAST = parseSelector({ $nor: [{ a: 1 }] });
  test.equal(norAST.clauses[0].type, AST.NOR);
});

Tinytest.add('afs - query - parseSelector - $not', (test) => {
  const ast = parseSelector({ a: { $not: { $gt: 5 } } });
  const not = ast.clauses[0];
  test.equal(not.type, AST.NOT);
  // Inner is a Field with the predicate negated.
  test.equal(not.clause.type, AST.FIELD);
  test.equal(not.clause.predicate.kind, PRED.GT);
});

Tinytest.add('afs - query - parseSelector - $where preserved', (test) => {
  const fn = function () { return true; };
  const ast = parseSelector({ $where: fn });
  test.equal(ast.clauses[0], { type: AST.WHERE, fn });
});

Tinytest.add('afs - query - parseSelector - escape hatches preserve raw operand', (test) => {
  const ast = parseSelector({
    location: { $near: { $geometry: { type: 'Point', coordinates: [1, 2] } } },
  });
  const node = ast.clauses[0];
  test.equal(node.type, AST.GEO);
  test.equal(node.op, 'Near');
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

Tinytest.add('afs - query - parseSelector - idempotent on already-parsed AST', (test) => {
  const once = parseSelector({ a: { $gt: 5 } });
  const twice = parseSelector(once);
  test.equal(once, twice);                  // same reference
});

// ---------------------------------------------------------------------------
// Error surface
// ---------------------------------------------------------------------------

Tinytest.add('afs - query - parseSelector - rejects array top-level', (test) => {
  test.throws(() => parseSelector([1, 2]), (e) => e instanceof ParseError);
});

Tinytest.add('afs - query - parseSelector - rejects boolean top-level', (test) => {
  test.throws(() => parseSelector(true), (e) => e instanceof ParseError);
});

Tinytest.add('afs - query - parseSelector - rejects unknown operator', (test) => {
  test.throws(
    () => parseSelector({ a: { $totallyMadeUp: 1 } }),
    (e) => e instanceof ParseError && /\$totallyMadeUp/.test(e.message)
  );
});

// ---------------------------------------------------------------------------
// parseModifier — replacement document
// ---------------------------------------------------------------------------

Tinytest.add('afs - query - parseModifier - replacement document', (test) => {
  const ast = parseModifier({ name: 'alice', age: 30 });
  test.equal(ast.type, AST.MODIFIER_PROGRAM);
  test.isTrue(ast.isReplacement);
  test.equal(ast.replacement, { name: 'alice', age: 30 });
  test.equal(ast.ops, []);
});

// ---------------------------------------------------------------------------
// parseModifier — value-update operators
// ---------------------------------------------------------------------------

Tinytest.add('afs - query - parseModifier - $set with dotted path', (test) => {
  const ast = parseModifier({ $set: { 'profile.name': 'alice', age: 30 } });
  test.equal(ast.isReplacement, false);
  test.equal(ast.ops.length, 2);
  const setName = ast.ops.find((o) => o.path[0] === 'profile');
  test.equal(setName, { kind: MOD.SET, path: ['profile', 'name'], value: 'alice' });
});

Tinytest.add('afs - query - parseModifier - $unset', (test) => {
  const ast = parseModifier({ $unset: { x: 1 } });
  test.equal(ast.ops[0], { kind: MOD.UNSET, path: ['x'], value: 1 });
});

Tinytest.add('afs - query - parseModifier - $inc / $mul / $min / $max', (test) => {
  for (const [op, kind] of [['$inc', MOD.INC], ['$mul', MOD.MUL], ['$min', MOD.MIN], ['$max', MOD.MAX]]) {
    const ast = parseModifier({ [op]: { x: 5 } });
    test.equal(ast.ops[0], { kind, path: ['x'], value: 5 });
  }
});

Tinytest.add('afs - query - parseModifier - $rename', (test) => {
  const ast = parseModifier({ $rename: { 'a.b': 'c.d' } });
  test.equal(ast.ops[0], { kind: MOD.RENAME, from: ['a', 'b'], to: ['c', 'd'] });
});

Tinytest.add('afs - query - parseModifier - $currentDate true', (test) => {
  const ast = parseModifier({ $currentDate: { ts: true } });
  test.equal(ast.ops[0], { kind: MOD.CURRENT_DATE, path: ['ts'], asTimestamp: false });
});

Tinytest.add('afs - query - parseModifier - $currentDate $type timestamp', (test) => {
  const ast = parseModifier({ $currentDate: { ts: { $type: 'timestamp' } } });
  test.equal(ast.ops[0], { kind: MOD.CURRENT_DATE, path: ['ts'], asTimestamp: true });
});

// ---------------------------------------------------------------------------
// parseModifier — array operators
// ---------------------------------------------------------------------------

Tinytest.add('afs - query - parseModifier - $push simple', (test) => {
  const ast = parseModifier({ $push: { tags: 'a' } });
  test.equal(ast.ops[0], {
    kind: MOD.PUSH, path: ['tags'], value: 'a',
    each: null, position: null, slice: null, sort: null,
  });
});

Tinytest.add('afs - query - parseModifier - $push with $each + $position + $slice', (test) => {
  const ast = parseModifier({
    $push: { tags: { $each: ['a', 'b'], $position: 1, $slice: 5 } },
  });
  const op = ast.ops[0];
  test.equal(op.kind, MOD.PUSH);
  test.equal(op.each, ['a', 'b']);
  test.equal(op.position, 1);
  test.equal(op.slice, 5);
});

Tinytest.add('afs - query - parseModifier - $pop', (test) => {
  test.equal(parseModifier({ $pop: { x: 1 } }).ops[0],
             { kind: MOD.POP, path: ['x'], from: 'last' });
  test.equal(parseModifier({ $pop: { x: -1 } }).ops[0],
             { kind: MOD.POP, path: ['x'], from: 'first' });
});

Tinytest.add('afs - query - parseModifier - $pull with criterion', (test) => {
  const ast = parseModifier({ $pull: { tags: { $gt: 5 } } });
  const op = ast.ops[0];
  test.equal(op.kind, MOD.PULL);
  test.equal(op.path, ['tags']);
  test.isTrue(isAST(op.criterion));
});

Tinytest.add('afs - query - parseModifier - $pullAll', (test) => {
  const ast = parseModifier({ $pullAll: { tags: ['a', 'b'] } });
  test.equal(ast.ops[0], { kind: MOD.PULL_ALL, path: ['tags'], values: ['a', 'b'] });
});

Tinytest.add('afs - query - parseModifier - $addToSet simple', (test) => {
  const ast = parseModifier({ $addToSet: { tags: 'a' } });
  test.equal(ast.ops[0], { kind: MOD.ADD_TO_SET, path: ['tags'], values: ['a'] });
});

Tinytest.add('afs - query - parseModifier - $addToSet $each', (test) => {
  const ast = parseModifier({ $addToSet: { tags: { $each: ['a', 'b'] } } });
  test.equal(ast.ops[0], { kind: MOD.ADD_TO_SET, path: ['tags'], values: ['a', 'b'] });
});

Tinytest.add('afs - query - parseModifier - $bit', (test) => {
  const ast = parseModifier({ $bit: { flags: { and: 5 } } });
  test.equal(ast.ops[0], { kind: MOD.BIT, path: ['flags'], op: 'and', operand: 5 });
});

// ---------------------------------------------------------------------------
// Idempotence + errors
// ---------------------------------------------------------------------------

Tinytest.add('afs - query - parseModifier - idempotent', (test) => {
  const once = parseModifier({ $set: { x: 1 } });
  test.equal(parseModifier(once), once);
});

Tinytest.add('afs - query - parseModifier - mixed $-and-non-$ keys rejected', (test) => {
  test.throws(() => parseModifier({ $set: { x: 1 }, foo: 1 }), (e) => e instanceof ParseError);
});

Tinytest.add('afs - query - parseModifier - unknown operator rejected', (test) => {
  test.throws(() => parseModifier({ $totallyMadeUp: { x: 1 } }), (e) => e instanceof ParseError);
});

// ---------------------------------------------------------------------------
// parseSort
// ---------------------------------------------------------------------------

Tinytest.add('afs - query - parseSort - object form', (test) => {
  test.equal(parseSort({ name: 1, age: -1 }), {
    type: AST.SORT,
    keys: [
      { path: ['name'], direction: 'asc' },
      { path: ['age'],  direction: 'desc' },
    ],
  });
});

Tinytest.add('afs - query - parseSort - array form', (test) => {
  test.equal(parseSort([['name', 'asc'], ['age', 'desc']]), {
    type: AST.SORT,
    keys: [
      { path: ['name'], direction: 'asc' },
      { path: ['age'],  direction: 'desc' },
    ],
  });
});

Tinytest.add('afs - query - parseSort - $meta textScore', (test) => {
  const ast = parseSort({ score: { $meta: 'textScore' } });
  test.equal(ast.keys[0],
    { path: ['score'], direction: 'meta', metaField: 'textScore' });
});

Tinytest.add('afs - query - parseSort - empty', (test) => {
  test.equal(parseSort({}), { type: AST.SORT, keys: [] });
  test.equal(parseSort([]), { type: AST.SORT, keys: [] });
});

Tinytest.add('afs - query - parseSort - rejects bogus direction', (test) => {
  test.throws(() => parseSort({ x: 'sideways' }), (e) => e instanceof ParseError);
});

// ---------------------------------------------------------------------------
// parseProjection
// ---------------------------------------------------------------------------

Tinytest.add('afs - query - parseProjection - include mode', (test) => {
  const ast = parseProjection({ a: 1, b: 1 });
  test.equal(ast.mode, 'include');
  // _id implicitly included
  test.equal(ast.fields.find((f) => f.path[0] === '_id'),
             { path: ['_id'], include: true });
});

Tinytest.add('afs - query - parseProjection - exclude mode', (test) => {
  const ast = parseProjection({ a: 0 });
  test.equal(ast.mode, 'exclude');
  // _id NOT implicitly added in exclude mode
  test.equal(ast.fields.length, 1);
});

Tinytest.add('afs - query - parseProjection - mixed _id toggle', (test) => {
  const ast = parseProjection({ a: 1, _id: 0 });
  test.equal(ast.mode, 'mixed');
  test.equal(ast.fields.find((f) => f.path[0] === '_id').include, false);
});

Tinytest.add('afs - query - parseProjection - $slice', (test) => {
  const ast = parseProjection({ items: { $slice: 5 } });
  const f = ast.fields.find((x) => x.path[0] === 'items');
  test.equal(f.slice, { limit: 5 });
});

Tinytest.add('afs - query - parseProjection - $elemMatch', (test) => {
  const ast = parseProjection({ items: { $elemMatch: { qty: { $gt: 5 } } } });
  const f = ast.fields.find((x) => x.path[0] === 'items');
  test.isTrue(isAST(f.elemMatch));
});

Tinytest.add('afs - query - parseProjection - mixed include+exclude rejected', (test) => {
  // Mixing include and exclude (other than _id-toggle) is illegal in Mongo.
  test.throws(() => parseProjection({ a: 1, b: 0 }), (e) => e instanceof ParseError);
});
