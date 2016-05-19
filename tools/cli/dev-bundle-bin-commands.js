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
  if (process.platform === "win32") {
    devBundleBinCommand += win32Extensions[devBundleBinCommand];
  }

  var path = require("path");
  var binDir = path.resolve(__dirname, "..", "..", "dev_bundle", "bin");
  var cmd = path.join(binDir, devBundleBinCommand);
  var args = process.argv.slice(3);

  exports.process = require("child_process").spawn(cmd, args, {
    stdio: "inherit",
    env: Object.create(process.env, {
      // When npm looks for node, it must find dev_bundle/bin/node.
      PATH: { value: binDir + ":" + process.env.PATH }
    })
  });

  require("./flush-buffers-on-exit-in-windows.js");

  exports.process.on("exit", function (exitCode) {
    process.exit(exitCode);
  });
}
