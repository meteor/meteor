"use strict";

const fs = require("fs");
const path = require("path");
const files = require("../fs/mini-files.js");
const finder = require("./file-finder.js");
const hasOwn = Object.prototype.hasOwnProperty;

function getDevBundle() {
  return require("./dev-bundle.js");
}
exports.getDevBundle = getDevBundle;

exports.isValidCommand = function(name, devBundleDir) {
  if (name === "node" ||
      name === "npm") {
    return true;
  }

  if (! name || name.charAt(0) === ".") {
    // Disallow empty commands and commands that start with a period.
    return false;
  }

  const meteorCommandsJsonPath =
    path.join(devBundleDir, "bin", ".meteor-commands.json");

  try {
    var meteorCommands = require(meteorCommandsJsonPath);
  } catch (e) {
    return false;
  }

  // If `meteor <name>` is already a Meteor command, don't let anything in
  // dev_bundle/bin override it.
  return ! hasOwn.call(meteorCommands, name);
};

exports.getEnv = function (options) {
  const devBundle = options && options.devBundle;
  const devBundlePromise = typeof devBundle === "string"
    ? Promise.resolve(files.convertToOSPath(devBundle))
    : getDevBundle();

  return devBundlePromise.then(function (devBundleDir) {
    const extraPaths = [
      // When npm looks for node, it must find dev_bundle/bin/node.
      path.join(devBundleDir, "bin"),
    ];

    // Include any local node_modules/.bin directories.
    extraPaths.push.apply(
      extraPaths,
      finder.findNodeModulesDotBinDirs()
    );

    extraPaths.push(
      // Also make available any scripts installed by packages in
      // dev_bundle/lib/node_modules, such as node-gyp.
      path.join(devBundleDir, "lib", "node_modules", ".bin")
    );

    const env = Object.create(process.env);

    // Make sure notifications to update npm aren't presented to the user.
    env.NPM_CONFIG_NO_UPDATE_NOTIFIER = true;

    // Make sure `meteor npm install --global ...` installs into
    // dev_bundle/lib/node_modules by default.
    if (! env.NPM_CONFIG_PREFIX) {
      env.NPM_CONFIG_PREFIX = devBundleDir;
    }

    // Make sure we don't try to use the global ~/.npm cache accidentally.
    if (! env.NPM_CONFIG_CACHE) {
      env.NPM_CONFIG_CACHE = path.join(
        // If the user set NPM_CONFIG_PREFIX, respect that.
        env.NPM_CONFIG_PREFIX, ".npm");
    }

    if (env.METEOR_ALLOW_SUPERUSER) {
      // Note that env.METEOR_ALLOW_SUPERUSER could be "0" or "false", which
      // should propagate falsy semantics to NPM_CONFIG_UNSAFE_PERM.
      env.NPM_CONFIG_UNSAFE_PERM = env.METEOR_ALLOW_SUPERUSER;
    }

    // This allows node-gyp to find Node headers and libraries in
    // dev_bundle/.node-gyp.
    env.USERPROFILE = devBundleDir;

    if (options) {
      options.extraPaths = extraPaths;
    }

    const paths = extraPaths.slice(0);
    const PATH = env.PATH || env.Path;
    if (PATH) {
      paths.push(PATH);
    }

    env.PATH = paths.join(path.delimiter);

    if (process.platform === "win32") {
      return addWindowsVariables(devBundleDir, env);
    }

    return env;
  });
};

// Caching env.GYP_MSVS_VERSION allows us to avoid invoking Python every
// time Meteor runs an npm command. TODO Store this on disk?
let cachedMSVSVersion;

function addWindowsVariables(devBundleDir, env) {
  // On Windows we provide a reliable version of python.exe for use by
  // node-gyp (the tool that rebuilds binary node modules). #WinPy
  env.PYTHON = env.PYTHON || path.join(
    devBundleDir, "python", "python.exe");

  // While the original process.env object allows for case insensitive
  // access on Windows, Object.create interferes with that behavior,
  // so here we ensure env.PATH === env.Path on Windows.
  env.Path = env.PATH;

  if (cachedMSVSVersion) {
    env.GYP_MSVS_VERSION = cachedMSVSVersion;
  }

  if (env.GYP_MSVS_VERSION) {
    return Promise.resolve(env);
  }

  // If $GYP_MSVS_VERSION was not provided, use the gyp Python library to
  // infer it, or default to 2015 if that doesn't work.
  return new Promise(function (resolve) {
    const nodeGypPylibDir = path.join(
      devBundleDir, "lib", "node_modules", "node-gyp", "gyp", "pylib"
    );

    const child = require("child_process").spawn(env.PYTHON, ["-c", [
      "from gyp.MSVSVersion import SelectVisualStudioVersion",
      "try:",
      "  print SelectVisualStudioVersion(allow_fallback=False).short_name",
      "except:",
      "  print 2015"
    ].join("\n")], {
      cwd: nodeGypPylibDir,
      stdio: "pipe"
    });

    const chunks = [];
    child.stdout.on("data", function (chunk) {
      chunks.push(chunk);
    });

    function finish(codeOrError) {
      if (codeOrError) {
        // In the event of any kind of error, default to 2015.
        cachedMSVSVersion = "2015";
      } else {
        cachedMSVSVersion = Buffer.concat(chunks)
          .toString("utf8").replace(/^\s+|\s+$/g, "");
      }

      env.GYP_MSVS_VERSION = cachedMSVSVersion;

      resolve(env);
    }

    child.on("error", finish);
    child.on("exit", finish);
  });
}
