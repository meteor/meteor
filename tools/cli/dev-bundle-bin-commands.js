// Note that this file is required before we install our Babel hooks in
// ../tool-env/install-babel.js, so we can't use ES2015+ syntax here.

var win32Extensions = {
  node: ".exe",
  npm: ".cmd"
};

// The dev_bundle/bin command has to come immediately after the meteor
// command, as in `meteor npm` or `meteor node`, because we don't want to
// require("./main.js") for these commands.
var devBundleBinCommand = process.argv[2];
var args = process.argv.slice(3);

function getChildProcess() {
  if (! win32Extensions.hasOwnProperty(devBundleBinCommand)) {
    return Promise.resolve(null);
  }

  var helpers = require("./dev-bundle-bin-helpers.js");

  if (process.platform === "win32") {
    devBundleBinCommand += win32Extensions[devBundleBinCommand];
  }

  return Promise.all([
    helpers.getCommandPath(devBundleBinCommand),
    helpers.getEnv()
  ]).then(function (cmdAndEnv) {
    var cmd = cmdAndEnv[0];
    var env = cmdAndEnv[1];
    var child = require("child_process").spawn(cmd, args, {
      stdio: "inherit",
      env: env
    });

    require("./flush-buffers-on-exit-in-windows.js");

    child.on("exit", function (exitCode) {
      process.exit(exitCode);
    });

    return child;
  });
}

module.exports = getChildProcess();
