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

// Install a global ES2015-compliant Promise constructor that knows how to
// run all its callbacks in Fibers.
global.Promise = require('meteor-promise');

// Allow all Promise callbacks to be run in a Fiber.
global.Promise.Fiber = require('fibers');

// Install ES2015-complaint polyfills for Symbol, Map, Set, and String,
// patching the native implementations if they are available.
require('core-js/es6/symbol');
require('core-js/es6/map');
require('core-js/es6/set');
require('core-js/es6/string');

// Include helpers from NPM so that the compiler doesn't need to add boilerplate
// at the top of every file
require('meteor-babel').installRuntime();

// Installs source map support with a hook to add functions to look for source
// maps in custom places
require('./source-map-retriever-stack.js');
