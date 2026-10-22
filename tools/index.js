const { getChildProcess } = require("./cli/dev-bundle-bin-commands");

getChildProcess({ isFirstTry: true }).then(
  (child) => {
    if (!child) {
      // Use process.nextTick here to prevent the Promise from swallowing
      // errors from the rest of the setup code.
      process.nextTick(continueSetup);
    }
    // If we spawned a process to handle a dev_bundle/bin command like
    // `meteor npm` or `meteor node`, then don't run any other tool code.
  },
  (error) => {
    process.nextTick(function () {
      throw error;
    });
  }
);

function continueSetup() {
  // Set up the Babel transpiler
  require("./tool-env/install-babel");
  // Run the Meteor command line tool
  require("./cli/main");
}
