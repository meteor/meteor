#!/usr/bin/env node

var commands = require('./cli/dev-bundle-bin-commands.js');

commands.runOrElse(function () {
  // Set up the Babel transpiler
  require('./tool-env/install-babel.js');

  // Run the Meteor command line tool
  require('./cli/main.js');
});
