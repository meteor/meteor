var esprima = Npm.require('esprima');
var escope = Npm.require('escope');

JSAnalyze = {};

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
  var globalScope = scoper.scopes[0];

  var assignedGlobals = {};
  // Underscore is not available in this package.
  globalScope.implicit.variables.forEach(function (variable) {
    assignedGlobals[variable.name] = true;
  });

  return assignedGlobals;
};
