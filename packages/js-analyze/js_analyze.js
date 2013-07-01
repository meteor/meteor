var esprima = Npm.require('esprima');
var escope = Npm.require('escope');
var estraverse = Npm.require('estraverse');

var Syntax = estraverse.Syntax;

// @export JSAnalyze
JSAnalyze = {};

JSAnalyze.READ = 1;
JSAnalyze.WRITE = 2;

// Analyze the JavaScript source code `source` and return a dictionary
// of all the global dotted references.
//
// A global dotted reference is an expression of the form `Foo` or
// `Foo.Bar.Baz`, where `Foo` is an access to a global variable not defined
// in `source`.
//
// The value in the dictionary is either `JSAnalyze.READ`, if the reference
// is only ever read and not written, or `JSAnalyze.WRITE` if the reference
// is written (only or in addition).  A dotted reference is mapped to WRITE
// if it is every assigned to, or if it is part of a larger
// expression that is assigned to which consists of a series of dotted
// or bracketed member access expressions.  For example, in
// `Foo.Bar[baz].blah = 3`, the dotted reference `Foo.Bar` is reported
// as WRITE.
JSAnalyze.findGlobalDottedRefs = function (source) {
  // escope's analyzer treats vars in the top-level "Program" node as globals
  source = '(function () {' + source + '})';

  var parseTree = esprima.parse(source);
  var scoper = escope.analyze(parseTree);

  var currentScope = null;
  var dottedExpressionStack = [];

  var globalsFound = {};

  // Add _parent pointers to the tree
  estraverse.traverse(parseTree, {
    enter: function (node, parent) {
      node._parent = parent;
    }
  });

  estraverse.traverse(parseTree, {
    enter: function (node, parent) {
      currentScope = scoper.acquire(node) || currentScope;

      if (node.type === Syntax.Identifier) {
        var ref = null;
        // Find an `escope.Reference` in the current Scope whose
        // identifier node is `===` to `node`.  If found, this
        // means escope determined this site to be a reference
        // rather than some other identifier (like the `x` in
        // `var x` or `a.x`).
        for (var i = 0; i < currentScope.references.length; i++) {
          if (currentScope.references[i].identifier === node) {
            ref = currentScope.references[i];
            break;
          }
        }
        if (ref && ! ref.resolved) {
          // global; not resolved to a local
          var name = node.name;
          var expr = node;
          // find outer expression with dots, e.g. Foo.Bar.Baz
          while (expr._parent &&
                 expr._parent.type === Syntax.MemberExpression &&
                 expr._parent.object === expr &&
                 ! expr._parent.computed) {
            expr = expr._parent;
            name += '.' + expr.property.name;
          }
          // now expand expression to include bracketed access,
          // e.g. Foo.Bar.Baz[3].blah
          while (expr._parent &&
                 expr._parent.type === Syntax.MemberExpression &&
                 expr._parent.object === expr) {
            expr = expr._parent;
          }
          var accessType;
          // position of `expr`, aka `outer`, now determines whether this
          // access is a READ or WRITE (which encompasses read/write)
          var outer = expr;
          var outerParent = expr._parent;
          switch (outerParent.type) {
          case Syntax.AssignmentExpression:
            accessType = ((outerParent.left === outer) ? JSAnalyze.WRITE
                          : JSAnalyze.READ);
            break;
          case Syntax.UpdateExpression: // prefix or postfix `++` or `--`
            accessType = JSAnalyze.WRITE;
            break;
          case Syntax.ForInStatement:
            accessType = (outerParent.left === outer ?
                          JSAnalyze.WRITE : JSAnalyze.READ);
            break;
          default:
            accessType = JSAnalyze.READ;
            break;
          }
          globalsFound[name] = Math.max(globalsFound[name] || 0, accessType);
        }
      }
    },
    leave: function (node, parent) {
      currentScope = scoper.release(node) || currentScope;
    }
  });

  return globalsFound;
};
