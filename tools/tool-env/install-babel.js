// This file exists because it is the file in the tool that is not automatically
// transpiled by Babel

function babelRegister() {
  var meteorBabel = require('meteor-babel');
  var configure = require('meteor-babel/register');

  // It's potentially important that this call to configure comes before
  // we require fs/files.js, just in case the features enabled here are
  // used by fs/files.js.
  configure({
    babelOptions: meteorBabel.getDefaultOptions(
      require('./babel-features.js')
    )
  });

  // This require must come after the require("meteor-babel/register")
  // call above so that fs/files.js will be transpiled by meteor-babel.
  var files = require("../fs/files.js");
  var toolEnvPath = files.convertToStandardPath(__dirname);
  var toolsPath = files.pathDirname(toolEnvPath);
  var meteorPath = files.pathDirname(toolsPath);

  configure({
    sourceMapRootPath: meteorPath
  });
}

babelRegister(); // #RemoveInProd this line is removed in isopack.js

// Install ES2015-complaint polyfills for Object, Array, String, Function,
// Symbol, Map, and Set, patching the native implementations if available.
require("meteor-ecmascript-runtime");

// Install a global ES2015-compliant Promise constructor that knows how to
// run all its callbacks in Fibers.
global.Promise = require('meteor-promise');

// Allow all Promise callbacks to be run in a Fiber.
global.Promise.Fiber = require('fibers');

// Include helpers from NPM so that the compiler doesn't need to add boilerplate
// at the top of every file
require('meteor-babel').installRuntime();

// Installs source map support with a hook to add functions to look for source
// maps in custom places
require('./source-map-retriever-stack.js');
