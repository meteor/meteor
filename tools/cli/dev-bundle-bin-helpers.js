const fs = require("fs");
const path = require("path");
const { convertToOSPath } = require("./convert-to-os-path.js");
const { getDevBundleDir } = require('./dev-bundle');

const isWindows = process.platform === "win32";
const extensions = isWindows ? [".cmd", ".exe"] : [""];
const hasOwn = Object.prototype.hasOwnProperty;

module.exports = {
  getCommand,
  getEnv,
}

function getCommand (name, devBundleDir) {
  let result = null;

  // Strip leading and/or trailing whitespace.
  name = name.replace(/^\s+|\s+$/g, "");

  if (! isValidCommand(name, devBundleDir)) {
    return result;
  }

  extensions.some(function (ext) {
    const cmd = path.join(devBundleDir, "bin", name + ext);
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
      name === "npm" ||
      name === "npx") {
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
}

async function getEnv(options) {
  const devBundle = options && options.devBundle;

  /**
   * @type string
   */
  const devBundleDir = typeof devBundle === "string"
    ? await convertToOSPath(devBundle)
    : await getDevBundleDir();

  const paths = [
    // When npm looks for node, it must find dev_bundle/bin/node.
    path.join(devBundleDir, "bin"),

    // When npm looks for meteor, it should find dev_bundle/../meteor.
    path.dirname(devBundleDir),

    // Also make available any scripts installed by packages in
    // dev_bundle/lib/node_modules, such as node-gyp.
    path.join(devBundleDir, "lib", "node_modules", ".bin")
  ];

  const env = Object.create(process.env);
  env.NO_UPDATE_NOTIFIER = true;

  if (!env.NPM_CONFIG_PREFIX) {
    env.NPM_CONFIG_PREFIX = devBundleDir;
  }

  if (env.METEOR_ALLOW_SUPERUSER) {
    // Note that env.METEOR_ALLOW_SUPERUSER could be "0" or "false", which
    // should propagate falsy semantics to NPM_CONFIG_UNSAFE_PERM.
    env.NPM_CONFIG_UNSAFE_PERM = env.METEOR_ALLOW_SUPERUSER;
  }

  env.NPM_CONFIG_NODEDIR = devBundleDir;

  const PATH = env.PATH || env.Path;

  if (PATH) {
    paths.push(PATH);
  }

  env.PATH = paths.join(path.delimiter);

  if (process.platform === "win32") {
    return addWindowsVariables(devBundleDir, env);
  }

  return env;
}

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
