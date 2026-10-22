// Note that this file is required before we install our Babel hooks in
// ../tool-env/install-babel.js, so we can't use ES2015+ syntax here.

// The dev_bundle/bin command has to come immediately after the meteor
// command, as in `meteor npm` or `meteor node`, because we don't want to
// require("./main.js") for these commands.
const { getDevBundleDir, DEFAULT_DEV_BUNDLE_DIR } = require('./dev-bundle');
const { getEnv } = require('./dev-bundle-bin-helpers');
const devBundleBinCommand = process.argv[2];
const args = process.argv.slice(3);

async function getChildProcess({ isFirstTry }) {
  if (typeof devBundleBinCommand !== "string") {
    return Promise.resolve(null);
  }

  const helpers = require("./dev-bundle-bin-helpers");

  const [devBundleDir, env] = await Promise.all([
    getDevBundleDir(),
    getEnv()
  ]);

  if (isFirstTry && devBundleDir === DEFAULT_DEV_BUNDLE_DIR) {
    return null
  }

  const cmd = helpers.getCommand(devBundleBinCommand, devBundleDir);

  if (!cmd) {
    return null;
  }

  const child = require('child_process').spawn(cmd, args, {
    stdio: 'inherit',
    env: env,
    shell: process.platform === 'win32' && ['.cmd', '.bat'].some(_extension => cmd.endsWith(_extension)),
  });
  require("./flush-buffers-on-exit-in-windows");
  child.on("error", function (error) {
    console.log(error.stack || error);
  });
  child.on("exit", function (exitCode) {
    process.exit(exitCode);
  });
  return child;
}

module.exports = {
  getChildProcess
}
