// Note that this file is required before we install our Babel hooks in
// ../tool-env/install-babel.js, so we can't use ES2015+ syntax here.

"use strict";

const fs = require("fs");
const path = require("path");

// The dev_bundle/bin command has to come immediately after the meteor
// command, as in `meteor npm` or `meteor node`, because we don't want to
// require("./main.js") for these commands.
const devBundleBinCommand = process.argv[2];
const args = process.argv.slice(3);

// On Windows, try the .cmd and .exe extensions.
const isWindows = process.platform === "win32";
const extensions = isWindows ? [".cmd", ".exe"] : [""];

function getChildProcess() {
  if (typeof devBundleBinCommand !== "string") {
    return Promise.resolve(null);
  }

  const helpers = require("./dev-bundle-bin-helpers.js");
  const getEnvOptions = {};

  return Promise.all([
    helpers.getDevBundle(),
    helpers.getEnv(getEnvOptions)
  ]).then(function (devBundleAndEnv) {
    const devBundleDir = devBundleAndEnv[0];
    const env = devBundleAndEnv[1];

    // Strip leading and/or trailing whitespace.
    const name = devBundleBinCommand.replace(/^\s+|\s+$/g, "");

    if (! helpers.isValidCommand(name, devBundleDir)) {
      return null;
    }

    let cmd = null;

    getEnvOptions.extraPaths.some(function (dir) {
      return extensions.some(function (ext) {
        const candidate = path.join(dir, name + ext);
        try {
          if (fs.statSync(candidate).isFile()) {
            cmd = candidate;
            return true;
          }
        } catch (e) {
          return false;
        }
      });
    });

    if (! cmd) {
      return null;
    }

    const child = require("child_process").spawn(cmd, args, {
      stdio: "inherit",
      env: env
    });

    require("./flush-buffers-on-exit-in-windows.js");

    child.on("error", function (error) {
      console.log(error.stack || error);
    });

    child.on("exit", function (exitCode) {
      process.exit(exitCode);
    });

    return child;
  });
}

module.exports = getChildProcess();
