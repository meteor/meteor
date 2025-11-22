const fs = require('fs');
const path = require('path');

/**
 * Returns the current working directory of the Meteor application.
 * @returns {string} The absolute path to the Meteor application directory.
 */
export function getMeteorAppDir() {
  return process.cwd();
}

/**
 * Reads and parses the package.json file of the Meteor application.
 * @returns {Object} The parsed content of the package.json file.
 */
export function getMeteorAppPackageJson() {
  return JSON.parse(
    fs.readFileSync(`${getMeteorAppDir()}/package.json`, 'utf-8')
  );
}

/**
 * Retrieves the Meteor configuration from the application's package.json.
 * @returns {Object|undefined} The Meteor configuration object or undefined if not found.
 */
export function getMeteorAppConfig() {
  return typeof Plugin?.getMeteorConfig === 'function'
    ? Plugin.getMeteorConfig()
    : getMeteorAppPackageJson()?.meteor;
}

/**
 * Get Meteor's app port
 * @returns {false|*}
 */
export function getMeteorAppPort() {
  return Package?.meteor?.global?.currentCommand?.options?.['port'] || process.env.PORT || '3000';
}

/**
 * Retrieves the modern configuration from the application's package.json.
 * @returns {Object|undefined} The modern configuration object or undefined if not found.
 */
export function getMeteorAppConfigModern() {
  return getMeteorAppConfig()?.modern;
}

/**
 * Retrieves the verbose flag from the application's package.json.
 * @returns {boolean|undefined} The verbose flag or undefined if not found.
 */
export function isMeteorAppConfigModernVerbose() {
  return getMeteorAppConfigModern()?.verbose ||
    getMeteorAppConfigModern()?.transpiler?.verbose || false;
}

/**
 * Retrieves the auto install deps flag from the app's package.json.
 * @returns {Boolean|*}
 */
export function hasMeteorAppConfigAutoInstallDeps() {
  const { autoInstallDeps = true } = getMeteorAppConfig() || {};
  return !!autoInstallDeps;
}

/**
 * Retrieves the entry points for the Meteor application from the configuration.
 * Uses Plugin.getMeteorConfig() if available, otherwise falls back to getMeteorAppConfig().
 * @returns {Object} An object containing the main and test entry points for client and server.
 * @returns {string|undefined} mainClient - The client main module path.
 * @returns {string|undefined} mainServer - The server main module path.
 * @returns {string|undefined} testClient - The client test module path.
 * @returns {string|undefined} testServer - The server test module path.
 */
export function getMeteorAppEntrypoints() {
  const meteorConfig = getMeteorAppConfig();
  return {
    mainClient: meteorConfig?.mainModule?.client,
    mainServer: meteorConfig?.mainModule?.server,
    testClient: meteorConfig?.testModule?.client || meteorConfig?.testModule,
    testServer: meteorConfig?.testModule?.server || meteorConfig?.testModule,
  };
}

/**
 * Retrieves the initial entry points for the Meteor application from the package.json.
 * @returns {Object} An object containing the main and test entry points for client and server.
 * @returns {string|undefined} mainClient - The client main module path.
 * @returns {string|undefined} mainClientHtml - The client main html path.
 * @returns {string|undefined} mainServer - The server main module path.
 * @returns {string|undefined} testClient - The client test module path.
 * @returns {string|undefined} testServer - The server test module path.
 */
export function getMeteorInitialAppEntrypoints() {
  const meteorConfig = getMeteorAppPackageJson()?.meteor;
  const mainClient = meteorConfig?.mainModule?.client;

  let mainClientHtml;
  if (mainClient) {
    const clientDir = path.dirname(mainClient);
    const clientBasename = path.basename(mainClient, path.extname(mainClient));
    const htmlPath = path.join(
      getMeteorAppDir(),
      clientDir,
      `${clientBasename}.html`
    );

    if (fs.existsSync(htmlPath)) {
      mainClientHtml = path.join(clientDir, `${clientBasename}.html`);
    } else {
      // Find first html in entry folder
      const files = fs.readdirSync(path.join(getMeteorAppDir(), clientDir));
      const htmlFile = files.find((file) => path.extname(file) === ".html");
      if (htmlFile) {
        mainClientHtml = path.join(clientDir, htmlFile);
      }
    }
  }

  return {
    mainClient,
    mainClientHtml,
    mainServer: meteorConfig?.mainModule?.server,
    ...(meteorConfig?.testModule?.client && {
      testClient: meteorConfig?.testModule?.client,
    }),
    ...(meteorConfig?.testModule?.server && {
      testServer: meteorConfig?.testModule?.server,
    }),
    ...(!meteorConfig?.testModule?.client &&
      !meteorConfig?.testModule?.server && {
        testModule: meteorConfig?.testModule,
      }),
  };
}

/**
 * Checks if the current Meteor project is configured as test module.
 * @returns {boolean}
 */
export function isMeteorAppTestModule() {
  return getMeteorInitialAppEntrypoints().testModule != null;
}

/**
 * Sets the Meteor application entry points in environment variables.
 * @param {Object} options - The entry points configuration object.
 * @param {string} [options.mainClient] - The client main module path.
 * @param {string} [options.mainServer] - The server main module path.
 * @param {string} [options.testModule] - The test module path.
 * @param {string} [options.testClient] - The client test module path.
 * @param {string} [options.testServer] - The server test module path.
 */
export function setMeteorAppEntrypoints({
  mainClient,
  mainServer,
  testModule,
  testClient,
  testServer,
}) {
  if (mainClient) {
    process.env.METEOR_CONFIG_CLIENT = mainClient;
  }
  if (mainServer) {
    process.env.METEOR_CONFIG_SERVER = mainServer;
  }
  if (testModule) {
    process.env.METEOR_CONFIG_TEST = testModule;
  } else {
    if (testClient) {
      process.env.METEOR_CONFIG_TEST_CLIENT = testClient;
    }
    if (testServer) {
      process.env.METEOR_CONFIG_TEST_SERVER = testServer;
    }
  }
  global.reinitializeMeteorConfig?.();
}

/**
 * Sets patterns to be ignored by the Meteor application in the environment variable.
 * Appends the new ignore pattern to any existing ones.
 * @param {string} ignore - The pattern to be ignored.
 */
export function setMeteorAppIgnore(ignore) {
  process.env.METEOR_IGNORE = `${process.env.METEOR_IGNORE || ''} ${ignore}`.trim();
}

/**
 * Checks if the current Meteor command is 'run'.
 * @returns {boolean} True if the current command is 'run', false otherwise.
 */
export function isMeteorAppRun() {
  return Package?.meteor?.global?.currentCommand?.name === 'run';
}

/**
 * Checks if the current Meteor command is 'build'.
 * @returns {boolean} True if the current command is 'build', false otherwise.
 */
export function isMeteorAppBuild() {
  return ['build', 'deploy'].includes(Package?.meteor?.global?.currentCommand?.name);
}

/**
 * Checks if the current Meteor command is 'test'.
 * @returns {boolean} True if the current command is 'test', false otherwise.
 */
export function isMeteorAppTest() {
  return Package?.meteor?.global?.currentCommand?.name === 'test';
}

/**
 * Checks if the current Meteor command is 'test' and is running in full app mode.
 * @returns {false|*}
 */
export function isMeteorAppTestFullApp() {
  return isMeteorAppTest() && !!Package?.meteor?.global?.currentCommand?.options?.['full-app'];
}

/**
 * Checks if the current Meteor command is 'test' and is running in watch mode.
 * @returns {boolean} True if the current command is 'test' and is running in watch mode, false otherwise.
 */
export function isMeteorAppTestWatch() {
  return isMeteorAppTest() && !Package?.meteor?.global?.currentCommand?.options?.once;
}

/**
 * Check if the current Meteor current command is running Android.
 * @returns {boolean}
 */
export function isMeteorAppNativeAndroid() {
  return Package?.meteor?.global?.currentCommand?.options?.args?.some(_arg =>
    ['android', 'android-device'].includes(_arg)
  );
}

/**
 * Check if the current Meteor current command is running iOS.
 * @returns {boolean}
 */
export function isMeteorAppNativeIos() {
  return Package?.meteor?.global?.currentCommand?.options?.args?.some(_arg =>
    ['ios', 'ios-device'].includes(_arg)
  );
}

/**
 * Checks if the current Meteor command is running native.
 * @returns {boolean}
 */
export function isMeteorAppNative() {
  return isMeteorAppNativeAndroid() || isMeteorAppNativeIos();
}

/**
 * Checks if the Meteor application is running in development mode.
 * @returns {boolean} True if the application is in development mode, false otherwise.
 */
export function isMeteorAppDevelopment() {
  return Package.meteor?.Meteor.isDevelopment && !isMeteorAppBuild();
}

/**
 * Checks if the Meteor application is running in production mode.
 * @returns {boolean} True if the application is in production mode, false otherwise.
 */
export function isMeteorAppProduction() {
  return Package.meteor?.Meteor.isProduction || isMeteorAppBuild();
}

/**
 * Checks if the Meteor application is running in debug mode.
 * @returns {boolean} True if the application is in debug mode, false otherwise.
 */
export function isMeteorAppDebug() {
  return Package.meteor?.Meteor.isDebug || (
    !!process.env.NODE_INSPECTOR_IPC ||
    !!process.env.VSCODE_INSPECTOR_OPTIONS ||
    Object.keys(global.currentCommand?.options || {}).some(function(_arg) {
      return ['inspect', 'debug', 'brk'].includes(_arg);
    })
  );
}

/**
 * Sets a custom script URL for the Meteor application in the environment variable.
 * @param {string} scriptUrl - The URL of the custom script.
 */
export function setMeteorAppCustomScriptUrl(scriptUrl) {
  process.env.METEOR_APP_CUSTOM_SCRIPT_URL = scriptUrl;
}

/**
 * Retrieves a list of all packages installed in the Meteor application.
 * @returns {string[]} An array of package names.
 */
export function getMeteorAppPackages() {
  return Object.keys(Package?.meteor?.global?.packageVersionMap || {});
}

/**
 * Gets all files and folders from the root level of the Meteor application.
 * @param {Object} options - Options for getting files and folders.
 * @param {boolean} [options.recursive=true] - Whether to scan directories recursively.
 * @param {Array<string>} [options.ignore=[]] - Patterns to ignore (e.g., ['node_modules', '.git']).
 * @param {boolean} [options.includeStats=false] - Whether to include file/folder stats in the result.
 * @param {string} [options.startPath] - Custom start path (defaults to Meteor app root).
 * @returns {Object} An object with 'files' and 'directories' arrays containing paths relative to the root.
 */
export function getMeteorAppFilesAndFolders(options = {}) {
  const {
    recursive = true,
    ignore = ['node_modules', '.git', '.meteor/local'],
    includeStats = false,
    startPath = getMeteorAppDir()
  } = options;

  // Helper function to check if a path should be ignored
  const shouldIgnore = (itemPath) => {
    const relativePath = path.relative(getMeteorAppDir(), itemPath);
    return ignore.some(pattern => {
      if (pattern.endsWith('/**')) {
        const dirPattern = pattern.slice(0, -3);
        return relativePath === dirPattern || relativePath.startsWith(`${dirPattern}/`);
      }
      return relativePath === pattern || relativePath.startsWith(`${pattern}/`);
    });
  };

  // Helper function to recursively scan directories
  const scanDirectory = (dirPath) => {
    const result = {
      files: [],
      directories: []
    };

    if (shouldIgnore(dirPath)) {
      return result;
    }

    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);

        // Skip if the item should be ignored
        if (shouldIgnore(itemPath)) {
          continue;
        }

        try {
          const stats = fs.statSync(itemPath);
          const relativePath = path.relative(getMeteorAppDir(), itemPath);

          if (stats.isDirectory()) {
            // Add directory to the result
            result.directories.push(
              includeStats ? { path: relativePath, stats } : relativePath
            );

            // Recursively scan subdirectories if recursive option is true
            if (recursive) {
              const subResult = scanDirectory(itemPath);
              result.files.push(...subResult.files);
              result.directories.push(...subResult.directories);
            }
          } else if (stats.isFile()) {
            // Add file to the result
            result.files.push(
              includeStats ? { path: relativePath, stats } : relativePath
            );
          }
        } catch (error) {
          // Skip items that can't be accessed
          console.error(`Error accessing ${itemPath}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}: ${error.message}`);
    }

    return result;
  };

  // Start the scan from the specified path
  return scanDirectory(startPath);
}

/**
 * Requires a module relative to the Meteor tools directory.
 * @param {string} filePath - The path of the file to require, relative to the Meteor tools directory.
 * @returns {Object} The exported module from the required file.
 */
export function getMeteorToolsRequire(filePath) {
  const mainModule = global.process.mainModule;
  const absPath = mainModule.filename.split(path.sep).slice(0, -1).join(path.sep);
  return mainModule.require(path.resolve(absPath, filePath));
}

/**
 * Checks if the Meteor application is a Blaze project.
 * @returns {boolean} True if the application is a Blaze project, false otherwise.
 */
export function isMeteorBlazeProject() {
  return getMeteorAppPackages().includes('blaze') || getMeteorAppPackages().includes('blaze-html-templates');
}

/**
 * Checks if the Meteor application is a Blaze Hot project.
 * @returns {boolean} True if the application is a Blaze Hot project, false otherwise.
 */
export function isMeteorBlazeHotProject() {
  return isMeteorBlazeProject() && getMeteorAppPackages().includes('blaze-hot');
}

/**
 * Checks if the Meteor application is a Coffeescript project.
 * @returns {boolean}
 */
export function isMeteorCoffeescriptProject() {
  return getMeteorAppPackages().includes('coffeescript');
}

/**
 * Checks if the Meteor application is a Less project.
 * @returns {boolean} True if the application has the 'less' package, false otherwise.
 */
export function isMeteorLessProject() {
  return getMeteorAppPackages().includes('less');
}

/**
 * Checks if the Meteor application is a SCSS project.
 * @returns {boolean} True if the application has any package containing 'scss', false otherwise.
 */
export function isMeteorScssProject() {
  return getMeteorAppPackages().some(pkg => pkg.includes('scss'));
}

/**
 * Checks if the Meteor application is a Bundle Visualizer project.
 * @returns {boolean}
 */
export function isMeteorBundleVisualizerProject() {
  return getMeteorAppPackages().includes('bundle-visualizer');
}

/**
 * Checks if the Meteor application is a Typescript project.
 * @returns {boolean} True if the application is a Typescript project, false otherwise.
 */
export function isMeteorTypescriptProject() {
  return getMeteorAppPackages().includes('typescript');
}

/**
 * Checks if the current Meteor command is 'test-packages'.
 * @returns {boolean} True if the current command is 'test-packages', false otherwise.
 */
export function isMeteorPackagesTest() {
  return Package?.meteor?.global?.currentCommand?.name === 'test-packages';
}

/**
 * Gets the package directories from the environment variables.
 * @returns {string[]}
 */
export function getMeteorEnvPackageDirs() {
  function packageDirsFromEnvVar(envVar, delimiter = path.delimiter) {
    return process.env[envVar] && process.env[envVar].split(delimiter) || [];
  }
  return [
    // METEOR_PACKAGE_DIRS should use the arch-specific delimiter
    ...(packageDirsFromEnvVar('METEOR_PACKAGE_DIRS', path.delimiter || ':')),
    // PACKAGE_DIRS (deprecated) always used ':' separator (yes, even Windows)
    ...(packageDirsFromEnvVar('PACKAGE_DIRS', ':')),
  ];
}
