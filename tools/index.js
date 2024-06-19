// Set up the Babel transpiler
require('./tool-env/install-babel.js');

require("./cli/dev-bundle-bin-commands.js").then(function (child) {
  if (! child) {
    // Use process.nextTick here to prevent the Promise from swallowing
    // errors from the rest of the setup code.
    process.nextTick(continueSetup);
  }
  // If we spawned a process to handle a dev_bundle/bin command like
  // `meteor npm` or `meteor node`, then don't run any other tool code.
}, function (error) {
  process.nextTick(function () {
    throw error;
  });
});

function continueSetup() {
  console.trace()
  // Run the Meteor command line tool
  require('./cli/main.js');
}
