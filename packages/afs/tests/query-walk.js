import { Tinytest } from 'meteor/tinytest';
import { walkSelector, walkModifier } from '../query/walk';
import { parseSelector } from '../query/parse-selector';
import { parseModifier } from '../query/parse-modifier';
import { UnsupportedOperatorError } from '../query/errors';

Tinytest.add('afs - query - walkSelector - dispatches by node type', (test) => {
  const ast = parseSelector({ $and: [{ a: 1 }, { b: 2 }] });
  const visitor = {
    And:   (node) => `(${node.clauses.map((c) => walkSelector(c, visitor)).join(' AND ')})`,
    Field: (node) => `${node.path[0]}=${node.predicate.value}`,
  };
  test.equal(walkSelector(ast, visitor), '((a=1) AND (b=2))');
});

Tinytest.add('afs - query - walkSelector - missing handler throws', (test) => {
  const ast = parseSelector({ $where: function () { return true; } });
  const visitor = { And: (node, ctx) => node.clauses.map((c) => walkSelector(c, visitor)).join(',') };
  test.throws(
    () => walkSelector(ast, visitor),
    (e) => e instanceof UnsupportedOperatorError && e.nodeType === 'Where'
  );
});

Tinytest.add('afs - query - walkModifier - dispatches by ModOp kind', (test) => {
  const ast = parseModifier({ $set: { x: 1 }, $inc: { y: 2 } });
  const visitor = {
    Set: (op) => `SET ${op.path[0]}=${op.value}`,
    Inc: (op) => `INC ${op.path[0]} += ${op.value}`,
  };
  const result = walkModifier(ast, visitor);
  test.equal(result.length, 2);
});
