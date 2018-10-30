var fs = require("fs");
var path = require("path");
var files = require("../fs/mini-files.js");
var isWindows = process.platform === "win32";
var extensions = isWindows ? [".cmd", ".exe"] : [""];
var hasOwn = Object.prototype.hasOwnProperty;

function getDevBundle() {
  return require("./dev-bundle.js");
}
exports.getDevBundle = getDevBundle;

exports.getCommand = function (name, devBundleDir) {
  var result = null;

  // Strip leading and/or trailing whitespace.
  name = name.replace(/^\s+|\s+$/g, "");

  if (! isValidCommand(name, devBundleDir)) {
    return result;
  }

  extensions.some(function (ext) {
    var cmd = path.join(devBundleDir, "bin", name + ext);
    try {
      if (fs.statSync(cmd).isFile()) {
        result = cmd;
        return true;
      }
    } catch (e) {
      return false;
    }
  });

  return result;
};

function isValidCommand(name, devBundleDir) {
  if (name === "node" ||
      name === "npm") {
    return true;
  }

  if (! name || name.charAt(0) === ".") {
    // Disallow empty commands and commands that start with a period.
    return false;
  }

  var meteorCommandsJsonPath =
    path.join(devBundleDir, "bin", ".meteor-commands.json");

  try {
    var meteorCommands = require(meteorCommandsJsonPath);
  } catch (e) {
    return false;
  }

  // If `meteor <name>` is already a Meteor command, don't let anything in
  // dev_bundle/bin override it.
  return ! hasOwn.call(meteorCommands, name);
}

exports.getEnv = function (options) {
  var devBundle = options && options.devBundle;
  var devBundlePromise = typeof devBundle === "string"
    ? Promise.resolve(files.convertToOSPath(devBundle))
    : getDevBundle();

  return devBundlePromise.then(function (devBundleDir) {
    var paths = [
      // When npm looks for node, it must find dev_bundle/bin/node.
      path.join(devBundleDir, "bin"),

      // When npm looks for meteor, it should find dev_bundle/../meteor.
      path.dirname(devBundleDir),

      // Also make available any scripts installed by packages in
      // dev_bundle/lib/node_modules, such as node-gyp.
      path.join(devBundleDir, "lib", "node_modules", ".bin")
    ];

    var env = Object.create(process.env);

    // Make sure notifications to update npm aren't presented to the user.
    env.NO_UPDATE_NOTIFIER = true;

    // Make sure `meteor npm install --global ...` installs into
    // dev_bundle/lib/node_modules by default.
    if (! env.NPM_CONFIG_PREFIX) {
      env.NPM_CONFIG_PREFIX = devBundleDir;
    }

    if (env.METEOR_ALLOW_SUPERUSER) {
      // Note that env.METEOR_ALLOW_SUPERUSER could be "0" or "false", which
      // should propagate falsy semantics to NPM_CONFIG_UNSAFE_PERM.
      env.NPM_CONFIG_UNSAFE_PERM = env.METEOR_ALLOW_SUPERUSER;
    }

    // This allows node-gyp to find Node headers and libraries in
    // dev_bundle/include/node.
    env.NPM_CONFIG_NODEDIR = devBundleDir;

    var PATH = env.PATH || env.Path;
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
var cachedMSVSVersion;

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
    var nodeGypPylibDir = path.join(
      devBundleDir, "lib", "node_modules", "node-gyp", "gyp", "pylib"
    );

    var child = require("child_process").spawn(env.PYTHON, ["-c", [
      "from gyp.MSVSVersion import SelectVisualStudioVersion",
      "try:",
      "  print SelectVisualStudioVersion(allow_fallback=False).short_name",
      "except:",
      "  print 2015"
    ].join("\n")], {
      cwd: nodeGypPylibDir,
      stdio: "pipe"
    });

    var chunks = [];
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
