// This file exists because it is the file in the tool that is not automatically
// transpiled by Babel

function babelRegister() {
  require('meteor-babel/register')({
    babelOptions: require('meteor-babel').getDefaultOptions(
      require('./babel-features.js')
    )
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
