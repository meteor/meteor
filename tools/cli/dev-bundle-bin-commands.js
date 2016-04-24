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
  var path = require("path");
  var devBundleDir = path.resolve(__dirname, "..", "..", "dev_bundle");
  var binDir = path.join(devBundleDir, "bin");
  var env = Object.create(process.env);

  // When npm looks for node, it must find dev_bundle/bin/node.
  env.PATH = binDir + ":" + env.PATH;

  if (process.platform === "win32") {
    // On Windows we provide a reliable version of python.exe for use by
    // node-gyp (the tool that rebuilds binary node modules). #WinPy
    env.PYTHON = env.PYTHON || path.join(
      devBundleDir, "python", "python.exe");

    // We don't try to install a compiler toolchain on the developer's
    // behalf, but setting GYP_MSVS_VERSION helps select the right one.
    env.GYP_MSVS_VERSION = env.GYP_MSVS_VERSION || "2015";

    devBundleBinCommand += win32Extensions[devBundleBinCommand];
  }

  var cmd = path.join(binDir, devBundleBinCommand);
  var args = process.argv.slice(3);

  exports.process = require("child_process").spawn(cmd, args, {
    stdio: "inherit",
    env: env
  });

  require("./flush-buffers-on-exit-in-windows.js");

  exports.process.on("exit", function (exitCode) {
    process.exit(exitCode);
  });
}
