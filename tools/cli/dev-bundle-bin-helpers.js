var fs = require("fs");
var path = require("path");
var files = require("../fs/mini-files.js");

function getDevBundle() {
  return require("./dev-bundle.js");
}
exports.getDevBundle = getDevBundle;

exports.getEnv = function (options) {
  var devBundle = options && options.devBundle;
  var devBundlePromise = typeof devBundle === "string"
    ? Promise.resolve(files.convertToOSPath(devBundle))
    : getDevBundle();

  return devBundlePromise.then(function (devBundleDir) {
    var paths = [
      // When npm looks for node, it must find dev_bundle/bin/node.
      path.join(devBundleDir, "bin"),
      // Also make available any scripts installed by packages in
      // dev_bundle/lib/node_modules, such as node-gyp.
      path.join(devBundleDir, "lib", "node_modules", ".bin")
    ];

    var env = Object.create(process.env);

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
