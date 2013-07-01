var esprima = Npm.require('esprima');
var escope = Npm.require('escope');
var estraverse = Npm.require('estraverse');

Tinytest.add("estools - parser", function (test) {
  var tree = esprima.parse('1+1');
  test.equal(tree, {
    "type": "Program",
    "body": [{
      "type": "ExpressionStatement",
      "expression": {
        "type": "BinaryExpression",
        "operator": "+",
        "left": {
          "type": "Literal",
          "value": 1,
          "raw": "1"
        },
        "right": {
          "type": "Literal",
          "value": 1,
          "raw": "1"}}}]
  });
});

Tinytest.add("estools - scoper", function (test) {
  var tree = esprima.parse('var x = 1');
  var scoper = escope.analyze(tree);
  scoper.attach();

  var getScope = function (node) {
    return node[escope.Scope.mangledName];
  };
  var Syntax = estraverse.Syntax;

  var refs = getScope(tree).references;
  test.equal(refs.length, 1);
  test.equal(refs[0].flag, escope.Reference.WRITE);
  test.equal(refs[0].identifier, { type: Syntax.Identifier, name: "x" });
});
