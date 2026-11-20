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

  // Historically we forwarded METEOR_ALLOW_SUPERUSER to
  // NPM_CONFIG_UNSAFE_PERM so npm wouldn't drop privileges when running
  // install scripts as root. npm 7 removed the automatic privilege drop
  // (so the flag became a no-op) and npm 8+ now treats it as an unknown
  // env config and prints `npm warn Unknown env config "unsafe-perm"`,
  // which leaks into stdout/stderr and breaks self-tests that assert on
  // exact output (e.g. `typescript template works` doing
  // `await run.expectEnd()` after `npx tsc`). dev_bundle currently ships
  // npm 11, so we just don't set it.

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

function addWindowsVariables(devBundleDir, env) {
  // On Windows we provide a reliable version of python.exe for use by
  // node-gyp (the tool that rebuilds binary node modules). #WinPy
  env.PYTHON = env.PYTHON || path.join(
    devBundleDir, "python", "python.exe");

  // While the original process.env object allows for case insensitive
  // access on Windows, Object.create interferes with that behavior,
  // so here we ensure env.PATH === env.Path on Windows.
  env.Path = env.PATH;

  // Official Node.js Windows builds can enable PGO and ThinLTO (Node 26
  // does), and node-gyp copies those settings from process.config into
  // addon builds. Node's common.gypi then adds -flto=thin and
  // -fprofile-use=$(SolutionDir)node.profdata, which addons can't use. The
  // unquoted profile path also breaks the build when the project path
  // contains spaces. node-gyp >= 13 disables LTO for addons but not PGO, so
  // turn all three off through node-gyp's package config env, unless set.
  ["enable_pgo_use", "enable_lto", "enable_thin_lto"].forEach(function (name) {
    const key = "npm_package_config_node_gyp_" + name;
    if (env[key] === undefined) {
      env[key] = "false";
    }
  });

  return env;
}
