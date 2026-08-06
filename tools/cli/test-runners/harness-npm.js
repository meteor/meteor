const fs = require('node:fs');
const path = require('node:path');

function createHarnessNpmService({
  root,
  autoInstall = true,
  install = async (appDir, options) =>
    require('../default-npm-deps.js').install(appDir, options),
}) {
  const packageJsonPath = path.join(root, 'package.json');
  const originalPackageJson = fs.existsSync(packageJsonPath)
    ? fs.readFileSync(packageJsonPath)
    : null;
  let ensurePromise = null;
  let retainManifest = false;
  let restored = false;

  const restoreOriginal = () => {
    if (restored) {
      return;
    }
    restored = true;
    if (originalPackageJson === null) {
      try {
        fs.unlinkSync(packageJsonPath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    } else {
      fs.writeFileSync(packageJsonPath, originalPackageJson);
    }
  };

  const service = {
    root,
    autoInstall,

    ensureHarnessManifest(options = {}) {
      if (ensurePromise) {
        return ensurePromise;
      }
      retainManifest = options.retain !== false;
      const {
        retain: _retain,
        ...installOptions
      } = options;
      ensurePromise = (async () => {
        try {
          const installed = await install(root, {
            ...installOptions,
            persistDefaultDependencies: true,
          });
          if (!installed) {
            const error = new Error(
              'Could not prepare npm dependencies for generated test harness.'
            );
            error.code = 'METEOR_TEST_RUNNER_NPM_INSTALL_FAILED';
            throw error;
          }
          return packageJsonPath;
        } catch (error) {
          restoreOriginal();
          throw error;
        }
      })();
      return ensurePromise;
    },

    async restoreIfTemporary() {
      if (!retainManifest) {
        restoreOriginal();
      }
    },
  };

  return Object.freeze(service);
}

module.exports = {
  createHarnessNpmService,
};
