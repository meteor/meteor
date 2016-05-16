#!/usr/bin/env node

if (! require('./cli/dev-bundle-bin-commands.js').process) {
  // Set up the Babel transpiler
  require('./tool-env/install-babel.js');

  // Run the Meteor command line tool
  require('./cli/main.js');
}
