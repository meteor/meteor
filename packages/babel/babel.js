Babel = Npm.require('babel-core');

// See README.md in this directory for more information.

Babel.transformMeteor = function (code, extraOptions) {
  var options = {
    whitelist: [
      'flow',
      'es6.arrowFunctions',
      'es6.templateLiterals',
      'es6.classes',
      'es6.blockScoping'
    ],
    externalHelpers: true,
    // "Loose" mode gets us faster and more IE-compatible transpilations of:
    // classes, computed properties, modules, for-of, and template literals.
    // Basically all the transformers that support "loose".
    // http://babeljs.io/docs/usage/loose/
    loose: "all"
  };

  return Babel.transform(code, _.extend(options, extraOptions));
};

// fake Underscore, since we can't depend on the Underscore package
// and still be loaded by the tool (before building other packages).
var hasOwnProperty = Object.prototype.hasOwnProperty;
var _ = {
  // Doesn't support more than two arguments (more than one "source"
  // object).
  extend: function (tgt, src) {
    for (var k in src) {
      if (hasOwnProperty.call(src, k))
        tgt[k] = src[k];
    }
    return tgt;
  }
};
