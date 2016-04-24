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

if (win32Extensions.hasOwnProperty(devBundleBinCommand)) {
  var helpers = require("./dev-bundle-bin-helpers.js");

  if (process.platform === "win32") {
    devBundleBinCommand += win32Extensions[devBundleBinCommand];
  }

  var cmd = helpers.getCommandPath(devBundleBinCommand);
  var args = process.argv.slice(3);

  exports.process = require("child_process").spawn(cmd, args, {
    stdio: "inherit",
    env: helpers.getEnv()
  });

  require("./flush-buffers-on-exit-in-windows.js");

  exports.process.on("exit", function (exitCode) {
    process.exit(exitCode);
  });
}
