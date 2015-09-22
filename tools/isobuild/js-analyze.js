import { parse } from 'meteor-babel';
import { analyze as analyzeScope } from 'escope';

// Like babel.parse, but annotates any thrown error with $ParseError = true.
function tryToParse(source) {
  try {
    return parse(source, {strictMode: false});
  } catch (e) {
    if (typeof e.loc === 'object') {
      e.$ParseError = true;
    }
    throw e;
  }
}

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
export function findAssignedGlobals(source) {
  // escope's analyzer treats vars in the top-level "Program" node as globals.
  // The \n// */\n is necessary in case source ends with an unclosed comment.
  const wrappedSource = 'function wrapper() {' + source + '\n// */\n}';

  const ast = tryToParse(wrappedSource);
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
  const scopeManager = analyzeScope(ast, { ignoreEval: true });
  const globalScope = scopeManager.acquire(ast);

  const assignedGlobals = {};
  // Underscore is not available in this package.
  globalScope.implicit.variables.forEach((variable) => {
    assignedGlobals[variable.name] = true;
  });

  return assignedGlobals;
}
