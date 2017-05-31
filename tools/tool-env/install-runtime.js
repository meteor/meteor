// Install ES2015-complaint polyfills for Object, Array, String, Function,
// Symbol, Map, Set, and Promise, patching the native implementations when
// they are available.
require("meteor-ecmascript-runtime");
require("./install-promise.js");

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

var Mp = module.constructor.prototype;
var moduleLoad = Mp.load;
Mp.load = function (filename) {
  var result = moduleLoad.apply(this, arguments);
  var runSetters = this.runSetters || this.runModuleSetters;
  if (typeof runSetters === "function") {
    // Make sure we call module.runSetters (or module.runModuleSetters, a
    // legacy synonym) whenever a module finishes loading.
    runSetters.call(this);
  }
  return result;
};

// Installs source map support with a hook to add functions to look for
// source maps in custom places.
require('./source-map-retriever-stack.js');
