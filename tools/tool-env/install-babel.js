// This file exists because it is the file in the tool that is not automatically
// transpiled by Babel

var meteorBabel = require("meteor-babel");

function babelRegister() {
  var path = require("path");
  var toolsPath = path.dirname(__dirname);
  var meteorPath = path.dirname(toolsPath);
  var cacheDir = path.join(meteorPath, ".babel-cache");

  meteorBabel.setCacheDir(cacheDir);

  require('meteor-babel/register')
    .allowDirectory(toolsPath)
    .setSourceMapRootPath(meteorPath);
}

babelRegister(); // #RemoveInProd this line is removed in isopack.js

// Install ES2015-complaint polyfills for Object, Array, String, Function,
// Symbol, Map, and Set, patching the native implementations if available.
require("meteor-ecmascript-runtime");

// Install a global ES2015-compliant Promise constructor that knows how to
// run all its callbacks in Fibers.
var Promise = global.Promise = require('meteor-promise');

// Allow all Promise callbacks to be run in a Fiber.
Promise.Fiber = require('fibers');

// Verify that the babel-runtime package is available to be required.
var regeneratorRuntime = require("babel-runtime/regenerator").default;

// If Promise.asyncApply is defined, use it to wrap calls to runtime.async
// so that the entire async function will run in its own Fiber, not just
// the code that comes after the first await.
var realAsync = regeneratorRuntime.async;
regeneratorRuntime.async = function () {
  return Promise.asyncApply(realAsync, regeneratorRuntime, arguments);
};

// Install global.meteorBabelHelpers so that the compiler doesn't need to
// add boilerplate at the top of every file
meteorBabel.defineHelpers();

// Installs source map support with a hook to add functions to look for source
// maps in custom places
require('./source-map-retriever-stack.js');
