var esprima = Npm.require('esprima');
var escope = Npm.require('escope');
var estraverse = Npm.require('estraverse');

var Syntax = estraverse.Syntax;

// @export JSAnalyze
JSAnalyze = {};

JSAnalyze.READ = 1;
JSAnalyze.WRITE = 2;

// Like esprima.parse, but annotates any thrown error with $ParseError = true.
var esprimaParse = function (source) {
  try {
    return esprima.parse(source);
  } catch (e) {
    if ('index' in e && 'lineNumber' in e &&
        'column' in e && 'description' in e) {
      e.$ParseError = true;
    }
    throw e;
  }
};

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
  // escope's analyzer treats vars in the top-level "Program" node as globals.
  // The newline is necessary in case source ends with a comment.
  source = '(function () {' + source + '\n})';

  var parseTree = esprimaParse(source);
  var scoper = escope.analyze(parseTree, {ignoreEval: true});

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


// Analyze the JavaScript source code `source` and return a dictionary of all
// globals which are assigned to in the package. The values in the dictionary
// are all `true`.
//
// This is intended for use in detecting package-scope variables in Meteor
// packages, where the linker needs to add a "var" statement to prevent them
// from staying as globals.
//
// It only cares about assignments to variables; an assignment to a field on an
// object (`Foo.Bar = true`) neither causes `Foo` nor `Foo.Bar` to be returned.
JSAnalyze.findAssignedGlobals = function (source) {
  // escope's analyzer treats vars in the top-level "Program" node as globals.
  // The newline is necessary in case source ends with a comment.
  source = '(function () {' + source + '\n})';

  var parseTree = esprimaParse(source);
  // We have to pass ignoreEval; otherwise, the existence of a direct eval call
  // causes escope to not bother to resolve references in the eval's scope.
  // This is because an eval can pull references inward:
  //
  //   function outer() {
  //     var i = 42;
  //     function inner() {
  //       eval('var i = 0');
  //       i;  // 0, not 42
  //     }
  //   }
  //
  // But it can't pull references outward, so for our purposes it is safe to
  // ignore.
  var scoper = escope.analyze(parseTree, {ignoreEval: true});

  var currentScope = null;
  var assignedGlobals = {};

  // XXX This whole traversal is somewhat overkill. escope actually already
  // calculates the implicit global variables. The following code ALMOST works,
  // and doesn't even require ignoreEval:
  //
  //  var globalScope = scoper.acquire(parseTree);
  //  if (globalScope.type !== 'global')
  //    throw new Error("Unexpected scope type " + globalScope.type);
  //
  //  // can't use underscore because we want to have no dependencies
  //  for (var i = 0; i < globalScope.variables.length; ++i) {
  //    var variable = globalScope.variables[i];
  //    // Because this is the global scope, and we wrap source in a function,
  //    // the only variables in it should have a single implicit definition.
  //    if (variable.defs.length !== 1)
  //      throw new Error("Unexpected def length", variable.defs.length);
  //    if (variable.defs[0].type !== escope.Variable.ImplicitGlobalVariable)
  //      throw new Error("Unexpected def type", variable.defs[0].type);
  //    assignedGlobals[variable.name] = true;
  //  }
  //
  // Unfortunately, escope's ImplicitGlobalVariable search has several bugs.
  //   https://github.com/Constellation/escope/issues/17


  // Traverse the tree looking for assignments to unreferenced variables.
  estraverse.traverse(parseTree, {
    enter: function (node, parent) {
      currentScope = scoper.acquire(node) || currentScope;

      // We only care about identifiers.
      if (node.type !== Syntax.Identifier)
        return;
      // We already know this one is an assigned global.
      // (Avoid using _.has here so that we have no Meteor package
      // dependencies.)
      if (assignedGlobals.hasOwnProperty(node.name))
        return;

      var ref = null;
      // Find an `escope.Reference` in the current Scope whose identifier node
      // is `===` to `node`.  If found, this means escope determined this site
      // to be a reference rather than some other identifier (like the `x` in
      // `var x` or `a.x`).
      for (var i = 0; i < currentScope.references.length; i++) {
        if (currentScope.references[i].identifier === node) {
          ref = currentScope.references[i];
          break;
        }
      }
      // If this isn't a reference at all, or it's been resolved to a local, do
      // nothing.
      if (!ref || ref.resolved)
        return;

      // OK, it's a global. But is it being assigned to? The situations where a
      // global is assigned to are:
      //    - left-hand side of an '=' assignment
      //    - the `x` in `for (x in y)` (without a `var`)
      // (You might think that ++, --, and the += family of operators also
      // write to globals, but they can't in and of themselves conjure up
      // a reference where none existed before.)
      if ((parent.type === Syntax.AssignmentExpression && parent.left === node
           && parent.operator === '=')
          || (parent.type === Syntax.ForInStatement && parent.left === node)) {
        assignedGlobals[node.name] = true;
      }
    },
    leave: function (node, parent) {
      currentScope = scoper.release(node) || currentScope;
    }
  });

  return assignedGlobals;
};
