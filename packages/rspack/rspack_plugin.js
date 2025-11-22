/**
 * @module rspack_plugin
 * @description Rspack Plugin for Meteor
 *
 * This is the main entry point for the Rspack plugin. It orchestrates the integration
 * between Rspack and Meteor by:
 * 1. Ensuring Rspack and related dependencies are installed
 * 2. Setting up the build context directory
 * 3. Configuring Meteor settings for Rspack
 * 4. Starting Rspack processes based on the Meteor command (run or build)
 * 5. Handling cleanup when the plugin is stopped
 *
 * The plugin uses top-level await to ensure asynchronous operations complete
 * before Meteor continues execution.
 */

// Import modules from lib
const {
  GLOBAL_STATE_KEYS,
} = require('./lib/constants');

const {
  ensureRspackInstalled,
  checkReactInstalled,
  checkAngularInstalled,
  checkTypescriptInstalled,
  ensureRspackReactInstalled,
} = require('./lib/dependencies');

const {
  ensureRspackBuildContextExists,
  ensureRspackConfigExists,
  cleanBuildContextFiles,
} = require('./lib/build-context');

const {
  startRspackClientServe,
  startRspackServerWatch,
  runRspackBuild,
  cleanup,
  calculateDevServerPort,
  calculateRsdoctorClientPort,
  calculateRsdoctorServerPort,
  getConfigFilePath,
  getCustomConfigFilePath,
} = require('./lib/processes');

const {
  configureMeteorForRspack
} = require('./lib/config');

const {
  setupCompilationTracking,
  waitForFirstCompilation,
} = require('./lib/compilation');

const {
  getGlobalState,
  setGlobalState
} = require('meteor/tools-core/lib/global-state');

const {
  isMeteorAppRun,
  isMeteorAppBuild,
  getMeteorInitialAppEntrypoints,
  getMeteorAppEntrypoints,
  isMeteorAppTest,
  isMeteorAppTestWatch,
  isMeteorAppTestFullApp,
  isMeteorAppDevelopment,
  isMeteorAppProduction,
  isMeteorAppDebug,
  isMeteorAppConfigModernVerbose,
  isMeteorAppNative,
  isMeteorBundleVisualizerProject,
} = require('meteor/tools-core/lib/meteor');

const {
  logInfo,
  logError,
} = require('meteor/tools-core/lib/log');

const {
  getNpxCommand,
  getNpmCommand,
  getYarnCommand,
  isYarnProject,
} = require('meteor/tools-core/lib/npm');
const { getMeteorAppConfig, hasMeteorAppConfigAutoInstallDeps } = require("../tools-core/lib/meteor");

if (isMeteorAppRun() || isMeteorAppBuild() || isMeteorAppTest()) {
  // Get entry points from Meteor configuration
  setGlobalState(GLOBAL_STATE_KEYS.INITIAL_ENTRYPONTS, getMeteorAppEntrypoints());

  let isYarnProj = process.env.YARN_ENABLED === 'true';
  // Main entry point - using top-level await
  try {
    // Check if the project is a Yarn project and store the result in environment variable if not already set
    if (process.env.YARN_ENABLED === undefined) {
      isYarnProj = isYarnProject();
      process.env.YARN_ENABLED = isYarnProj ? 'true' : 'false';
    }
    if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
      logInfo(`[i] Meteor Npx prefix: ${getNpxCommand([])?.prefix}`);
      logInfo(`[i] Meteor Npm prefix: ${getNpmCommand([])?.prefix}`);
      if (isYarnProj) {
        logInfo(`[i] Meteor Yarn prefix: ${getYarnCommand([])?.prefix}`);
      }
    }

    // Clean build context files only if they haven't been cleaned yet
    if (!getGlobalState(GLOBAL_STATE_KEYS.BUILD_CONTEXT_FILES_CLEANED)) {
      cleanBuildContextFiles();
      setGlobalState(GLOBAL_STATE_KEYS.BUILD_CONTEXT_FILES_CLEANED, true);
    }

    // Auto install deps (by default enabled)
    if (hasMeteorAppConfigAutoInstallDeps()) {
      // Ensure Rspack is installed
      await ensureRspackInstalled();
    }

    // Check if Rspack React is installed
    if (checkReactInstalled()) {
      // Auto install deps (by default enabled)
      if (hasMeteorAppConfigAutoInstallDeps()) {
        await ensureRspackReactInstalled();
      }
    }

    // Check if Angular is installed
    checkAngularInstalled();

    // Check if TypeScript is installed
    checkTypescriptInstalled();

    // Ensure the Rspack build context directory exists
    ensureRspackBuildContextExists();

    // Ensure the rspack.config.js file exists at the project level
    ensureRspackConfigExists();

    // Configure Meteor settings for Rspack
    configureMeteorForRspack();

    // Calculate and set the devServerPort at boot
    if (!process.env.RSPACK_DEVSERVER_PORT) {
      process.env.RSPACK_DEVSERVER_PORT = calculateDevServerPort();
      if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
        logInfo(`[i] Rspack DevServer Port: ${process.env.RSPACK_DEVSERVER_PORT}`);
      }
    }

    if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
      const configFile = getConfigFilePath();
      logInfo(`[i] Rspack default config: ${configFile}`);
      const projectConfigFile = getCustomConfigFilePath();
      logInfo(`[i] Rspack custom config: ${projectConfigFile}`);
    }

    // Calculate and set the Rsdoctor client and server ports at boot only if bundle visualizer is enabled
    if (isMeteorBundleVisualizerProject()) {
      if (!process.env.RSDOCTOR_CLIENT_PORT) {
        process.env.RSDOCTOR_CLIENT_PORT = calculateRsdoctorClientPort();
        if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
          logInfo(`[i] Rsdoctor Client Port: ${process.env.RSDOCTOR_CLIENT_PORT}`);
        }
      }

      if (!process.env.RSDOCTOR_SERVER_PORT) {
        process.env.RSDOCTOR_SERVER_PORT = calculateRsdoctorServerPort();
        if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
          logInfo(`[i] Rsdoctor Server Port: ${process.env.RSDOCTOR_SERVER_PORT}`);
        }
      }
    }

    // Register cleanup handler
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit();
    });

    // When running `meteor run` command
    if (isMeteorAppRun()) {
      // Setup compilation tracking and callbacks
      const {
        clientFirstCompile,
        serverFirstCompile,
        clientFirstCompilePromise,
        serverFirstCompilePromise,
        onCompileClient,
        onCompileServer,
      } = setupCompilationTracking();

      // For 'run' command, start Rspack in appropriate modes with distinct callbacks
      if (isMeteorAppDevelopment() && !isMeteorAppNative()) {
        startRspackClientServe({ onCompile: onCompileClient });
        startRspackServerWatch({ onCompile: onCompileServer });
      } else if (isMeteorAppProduction() || isMeteorAppNative()) {
        runRspackBuild({
          isClient: true,
          isServer: false,
          watch: true,
          onCompile: onCompileClient,
        });
        runRspackBuild({
          isServer: true,
          isClient: false,
          watch: true,
          onCompile: onCompileServer,
        });
      }

      // Wait for first compilation to complete
      await waitForFirstCompilation(clientFirstCompile, serverFirstCompile, clientFirstCompilePromise, serverFirstCompilePromise);

      // When running `meteor test` command
    } else if (isMeteorAppTest()) {
      const initialEntrypoints = getMeteorInitialAppEntrypoints();

      // Setup compilation tracking and callbacks
      const {
        clientFirstCompile,
        serverFirstCompile,
        clientFirstCompilePromise,
        serverFirstCompilePromise,
        onCompileClient,
        onCompileServer,
      } = setupCompilationTracking();

      // When run test for full app, run Rspack app server as well
      // isTestLike ensures the app runtime environment inherit test envs
      if (isMeteorAppTestFullApp()) {
        await runRspackBuild({
          isTest: false,
          isTestLike: true,
          isServer: true,
          isClient: false,
        });

        if (isMeteorAppTestWatch()) {
          runRspackBuild({
            isServer: true,
            isClient: false,
            isTest: false,
            isTestLike: true,
            watch: true,
          });
        }
      }

      // When testModule is specified for client or server, run Rspack considering those files
      if (initialEntrypoints?.testClient || initialEntrypoints?.testServer) {
        runRspackBuild({
          isTest: true,
          isClient: true,
          isServer: false,
          watch: isMeteorAppTestWatch(),
          onCompile: onCompileClient,
          label: 'Test',
        });

        runRspackBuild({
          isTest: true,
          isClient: false,
          isServer: true,
          watch: isMeteorAppTestWatch(),
          onCompile: onCompileServer,
          label: 'Test',
        });

        // Wait for first compilation to complete
        await waitForFirstCompilation(clientFirstCompile, serverFirstCompile, clientFirstCompilePromise, serverFirstCompilePromise);

        // When testModule is specified as a single file or not specified
      } else {
        runRspackBuild({
          isTest: true,
          isTestModule: true,
          isClient: true,
          isServer: false,
          watch: isMeteorAppTestWatch(),
          onCompile: onCompileClient,
          label: 'Test',
        });
        runRspackBuild({
          isTest: true,
          isTestModule: true,
          isClient: false,
          isServer: true,
          watch: isMeteorAppTestWatch(),
          onCompile: onCompileServer,
          label: 'Test',
        });
        await waitForFirstCompilation(clientFirstCompile, serverFirstCompile, clientFirstCompilePromise, serverFirstCompilePromise, { target: 'server' });
      }

      // When running `meteor build` command
    } else if (isMeteorAppBuild()) {
      // For 'build' command, run Rspack build without watch mode
      // Run client and server builds in parallel and wait for both to complete
      await Promise.all([
        runRspackBuild({ isClient: true, isServer: false }),
        runRspackBuild({ isServer: true, isClient: false }),
      ]);
    }
  } catch (error) {
    logError(`Rspack plugin error: ${error.message}`);
    throw error;
  }
}
