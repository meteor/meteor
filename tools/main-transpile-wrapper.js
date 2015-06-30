// This file exists because it is the file in the tool that is not automatically
// transpiled by Babel

function babelRegister() {
  require('meteor-babel/register')({
    babelOptions: require('meteor-babel').getDefaultOptions({
      // These feature flags must be kept in sync with the babelOptions
      // used in tools/isopack.js.
      modules: true,
      meteorAsyncAwait: true
    })
  });
}

babelRegister(); // #RemoveInProd this line is removed in isopack.js

// Install a global ES6-compliant Promise constructor that knows how to
// run all its callbacks in Fibers.
global.Promise = require("meteor-promise");

// Include helpers from NPM so that the compiler doesn't need to add boilerplate
// at the top of every file
require("meteor-babel").installRuntime();

// Installs source map support with a hook to add functions to look for source
// maps in custom places
require('./source-map-retriever-stack.js');

// Run the Meteor command line tool
require('./main.js');
