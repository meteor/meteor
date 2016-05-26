var path = require("path");
var devBundleDir = path.resolve(__dirname, "..", "..", "dev_bundle");
var binDir = path.join(devBundleDir, "bin");

exports.getCommandPath = function (command) {
  return path.join(binDir, command);
};

exports.getEnv = function () {
  var env = Object.create(process.env);
  var paths = [
    // When npm looks for node, it must find dev_bundle/bin/node.
    binDir,
    // Also make available any scripts installed by packages in
    // dev_bundle/lib/node_modules, such as node-gyp.
    path.join(devBundleDir, "lib", "node_modules", ".bin"),
  ];

  var PATH = env.PATH || env.Path;
  if (PATH) {
    paths.push(PATH);
  }

  env.PATH = paths.join(path.delimiter);

  if (process.platform === "win32") {
    // On Windows we provide a reliable version of python.exe for use by
    // node-gyp (the tool that rebuilds binary node modules). #WinPy
    env.PYTHON = env.PYTHON || path.join(
      devBundleDir, "python", "python.exe");

    // We don't try to install a compiler toolchain on the developer's
    // behalf, but setting GYP_MSVS_VERSION helps select the right one.
    env.GYP_MSVS_VERSION = env.GYP_MSVS_VERSION || "2015";

    // While the original process.env object allows for case insensitive
    // access on Windows, Object.create interferes with that behavior, so
    // here we ensure env.PATH === env.Path on Windows.
    env.Path = env.PATH;
  }

  return env;
};
