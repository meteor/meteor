// Install ES2015-complaint polyfills for Object, Array, String, Function,
// Symbol, Map, and Set, patching the native implementations if available.
require("meteor-ecmascript-runtime");

// Install a global ES2015-compliant Promise constructor that knows how to
// run all its callbacks in Fibers.
var Promise = global.Promise = global.Promise ||
  require("promise/lib/es6-extensions");
require("meteor-promise").makeCompatible(Promise, require("fibers"));

// Verify that the babel-runtime package is available to be required.
// The .join("/") prevents babel-plugin-transform-runtime from
// "intelligently" converting this to an import statement.
var regenerator = require([
  "babel-runtime",
  "regenerator"
].join("/"));

// Use Promise.asyncApply to wrap calls to runtime.async so that the
// entire async function will run in its own Fiber, not just the code that
// comes after the first await.
var realAsync = regenerator.async;
regenerator.async = function () {
  return Promise.asyncApply(realAsync, regenerator, arguments);
};

// Install global.meteorBabelHelpers so that the compiler doesn't need to
// add boilerplate at the top of every file.
require("meteor-babel").defineHelpers();

// Installs source map support with a hook to add functions to look for
// source maps in custom places.
require('./source-map-retriever-stack.js');
