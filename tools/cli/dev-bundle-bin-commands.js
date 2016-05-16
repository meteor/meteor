// Note that this file is required before we install our Babel hooks in
// ../tool-env/install-babel.js, so we can't use ES2015+ syntax here.

var helpers = require("./dev-bundle-bin-helpers.js");

// The dev_bundle/bin command has to come immediately after the meteor
// command, as in `meteor npm` or `meteor node`, because we don't want to
// require("./main.js") for these commands.
exports.runOrElse = function (elseCallback) {
  var cmd = helpers.getCommandPath(process.argv[2]);

  if (cmd) {
    var args = process.argv.slice(3);

    helpers.spawn(cmd, args).on("exit", function (exitCode) {
      process.exit(exitCode);
    });

  } else {
    var child = helpers.npmInstall();

    if (child) {
      child.on("exit", function (exitCode) {
        if (exitCode === 0) {
          elseCallback();
        } else {
          process.exit(exitCode);
        }
      });

    } else {
      elseCallback();
    }
  }
};
