/**
 * @module processes
 * @description Functions for managing Rspack processes
 */

import fs from "fs";
import path from "path";

const {
  spawnProcess,
  stopProcess,
  isProcessRunning
} = require('meteor/tools-core/lib/process');

const {
  logError,
  logInfo,
  logRaw,
  getRunLog,
} = require("meteor/tools-core/lib/log");

const {
  getMeteorAppDir,
  isMeteorAppTest,
  isMeteorAppTestFullApp,
  isMeteorAppDevelopment,
  isMeteorAppProduction,
  isMeteorAppDebug,
  isMeteorAppRun,
  isMeteorAppBuild,
  isMeteorAppNative,
  isMeteorBlazeProject,
  isMeteorBlazeHotProject,
  getMeteorInitialAppEntrypoints,
  isMeteorAppConfigModernVerbose,
  isMeteorBundleVisualizerProject,
  getMeteorAppPort,
  inheritMeteorToolNodeFlags,
} = require('meteor/tools-core/lib/meteor');

const {
  checkNpmDependencyExists,
  getNpxCommand,
  getMonorepoPath,
} = require('meteor/tools-core/lib/npm');

const {
  getGlobalState,
  setGlobalState
} = require('meteor/tools-core/lib/global-state');

const {
  GLOBAL_STATE_KEYS,
  RSPACK_CHUNKS_CONTEXT,
  RSPACK_ASSETS_CONTEXT,
  FILE_ROLE,
} = require('./constants');

const {
  getBuildFilePath,
  getBuildFileContent,
} = require('./build-context');

import {
  logCompilationOutput,
  logHmrServerStarted,
  parseMeteorRspackOutput,
  shouldLogVerbose,
  stripRspackLabel,
} from "./logging";
import { isMeteorAppProfile } from "../../tools-core/lib/meteor";

/**
 * Calculates the devServerPort based on process.env.PORT
 * Base port is 8077, and we add the sum of the digits of process.env.PORT
 * @returns {number} The calculated devServerPort
 */
export function calculateDevServerPort() {
  const port = getMeteorAppPort();
  const basePort = 8077;

  // Sum the digits of the port
  const digitSum = port.split('').reduce((sum, digit) => sum + parseInt(digit, 10), 0);

  return basePort + digitSum;
}

/**
 * Calculates the Rsdoctor client port based on process.env.PORT
 * Base port is 8885, and we add the sum of the digits of process.env.PORT
 * @returns {number} The calculated Rsdoctor client port
 */
export function calculateRsdoctorClientPort() {
  const port = getMeteorAppPort();
  const basePort = 8885;

  // Sum the digits of the port
  const digitSum = port.split('').reduce((sum, digit) => sum + parseInt(digit, 10), 0);

  return basePort + digitSum;
}

/**
 * Calculates the Rsdoctor server port based on process.env.PORT
 * Base port is 8885, and we add the sum of the digits of process.env.PORT + 1
 * @returns {number} The calculated Rsdoctor server port
 */
export function calculateRsdoctorServerPort() {
  const port = getMeteorAppPort();
  const basePort = 8885;

  // Sum the digits of the port
  const digitSum = port.split('').reduce((sum, digit) => sum + parseInt(digit, 10), 0);

  // Add 1 to differentiate from client port
  return basePort + digitSum + 1;
}

/**
 * Helper function to check for a file with different extensions in order of priority
 * @param {string} basePath - The base directory path (without 'rspack.config' and extension)
 * @returns {string|null} The full path with extension if found, null otherwise
 */
export function getCustomConfigFilePath(basePath = getMeteorAppDir()) {
  const configBasePath = path.join(basePath, 'rspack.config');

  // Check for .js extension first (highest priority)
  const jsPath = `${configBasePath}.js`;
  if (fs.existsSync(jsPath)) {
    return jsPath;
  }

  // Check for .ts extension next
  const tsPath = `${configBasePath}.ts`;
  if (fs.existsSync(tsPath)) {
    return tsPath;
  }

  // Check for .mjs extension next
  const mjsPath = `${configBasePath}.mjs`;
  if (fs.existsSync(mjsPath)) {
    return mjsPath;
  }

  // Check for .cjs extension last
  const cjsPath = `${configBasePath}.cjs`;
  if (fs.existsSync(cjsPath)) {
    return cjsPath;
  }

  // No valid config file found with any extension
  return null;
}

/**
 * Gets the appropriate config file name based on environment
 * @returns {string} The name of the Rspack config file
 * @throws {Error} If no valid config file is found
 */
export function getConfigFilePath() {
  // Check if the config file exists at the current path with any of the supported extensions
  const defaultConfigBasePath = path.join(process.cwd(), 'node_modules/@meteorjs/rspack');
  const defaultConfigPath = getCustomConfigFilePath(defaultConfigBasePath);
  if (defaultConfigPath) {
    return defaultConfigPath;
  }

  // If not found, check if we're in a monorepo and look for alternative config
  const monorepoPath = getMonorepoPath();
  if (monorepoPath) {
    const alternativeConfigBasePath = path.join(monorepoPath, 'node_modules/@meteorjs/rspack');
    const alternativeConfigPath = getCustomConfigFilePath(alternativeConfigBasePath);
    if (alternativeConfigPath) {
      return alternativeConfigPath;
    }
  }

  // If no config file is found, throw an error with suggestion to run npm install
  const isYarnProj = process.env.YARN_ENABLED === 'true';
  const installCommand = isYarnProj ? 'yarn install' : 'npm install';
  throw new Error(
    `Could not find rspack.config.js, rspack.config.ts, rspack.config.mjs, or rspack.config.cjs.\n\n` +
    `Try running \`${installCommand}\` in your project directory and then re-run the build.\n` +
    `This will ensure @meteorjs/rspack is installed correctly.`
  );
}

/**
 * Gets the appropriate Rspack environment variables and command line arguments
 * @param {Object} options - Options for environment variables
 * @param {boolean} options.isClient - Whether this is for client-side build
 * @param {boolean} options.isServer - Whether this is for server-side build
 * @param {boolean} options.isTest - Whether this is for test build
 * @param {boolean} options.isTestLike - Whether test envs should be inherited
 * @returns {Object} Object containing params (command line arguments) and envs (environment variables)
 */
export function getRspackEnv({ isClient, isServer, isTest: inIsTest, isTestLike: inIsTestLike }) {
  const RSPACK_BUILD_CONTEXT = require('./constants').RSPACK_BUILD_CONTEXT;

  const initialEntrypoints = getMeteorInitialAppEntrypoints();
  const isTest = inIsTest != null ? inIsTest : isMeteorAppTest();
  const isTestLike = isTest || inIsTestLike;
  const isTestEager =
    initialEntrypoints.testModule == null &&
    initialEntrypoints.testClient == null &&
    initialEntrypoints.testServer == null;
  const isTestModule = initialEntrypoints.testModule != null || isTestEager;
  const isTestFullApp = isMeteorAppTestFullApp();

  const module = isTest ? { isTest: true } : { isMain: true };
  const env = isMeteorAppDevelopment()
    ? { isDevelopment: true }
    : { isProduction: true };
  const side = isClient ? { isClient: true } : { isServer: true };
  const commandRole = isMeteorAppRun()
    ? { role: FILE_ROLE.run }
    : isMeteorAppBuild()
      ? { role: FILE_ROLE.build }
      : { role: FILE_ROLE.run };

  const entryKey = `${isTest && isTestModule ? 'test' : 'main'}${isClient ? 'Client' : 'Server'}`;
  const inputFilePath = initialEntrypoints[entryKey];
  const isTypescriptEnabled = process.env.METEOR_TYPESCRIPT_ENABLED === 'true' ||
    inputFilePath?.endsWith('.ts') ||
    inputFilePath?.endsWith('.tsx');

  const isReactEnabled = process.env.METEOR_REACT_ENABLED === 'true';
  const isAngularEnabled = process.env.METEOR_ANGULAR_ENABLED === 'true';
  const isTsxEnabled = isTypescriptEnabled && (inputFilePath?.endsWith('.tsx') || isReactEnabled);
  const isJsxEnabled = !isTypescriptEnabled && (inputFilePath?.endsWith('.jsx') || isReactEnabled);

  const isBlazeEnabled = isMeteorBlazeProject();
  const isBlazeHotEnabled = isMeteorBlazeHotProject();
  const isBundleVisualizerEnabled = isMeteorBundleVisualizerProject();

  const isProfile = isMeteorAppProfile();

  const swcExternalHelpers = checkNpmDependencyExists('@swc/helpers');

  const configPath = getConfigFilePath();
  const projectConfigPath = getCustomConfigFilePath();

  const pairs = [
    ["isDevelopment", isMeteorAppDevelopment()],
    ["isProduction", isMeteorAppProduction()],
    ["isDebug", isMeteorAppDebug()],
    ["isVerbose", isMeteorAppConfigModernVerbose()],
    ...((isProfile && [["isProfile", isMeteorAppProfile()]]) || []),
    ["isTest", isTest],
    ...(isTestLike ? [["isTestLike", isTestLike || isTest]] : []),
    ...((isTestLike && isTestFullApp && [["isTestFullApp", isTestFullApp]]) ||
      []),
    ...((isTestLike && isTestModule && [["isTestModule", isTestModule]]) || []),
    ...((isTestLike && isTestEager && [["isTestEager", isTestEager]]) || []),
    ["isRun", isMeteorAppRun()],
    ["isBuild", isMeteorAppBuild()],
    ["isNative", isMeteorAppNative()],
    ["isClient", isClient],
    ["isServer", isServer],
    [
      "entryPath",
      getBuildFilePath({
        ...module,
        ...env,
        ...side,
        isTestModule,
        role: FILE_ROLE.entry,
      }),
    ],
    [
      "outputPath",
      getBuildFilePath({
        ...module,
        ...env,
        ...side,
        isTestModule,
        role: FILE_ROLE.output,
      }),
    ],
    [
      "outputFilename",
      getBuildFilePath({
        ...env,
        ...side,
        isMain: true,
        role: FILE_ROLE.output,
        onlyFilename: true,
      }),
    ],
    [
      "runPath",
      getBuildFilePath({ ...module, ...env, ...side, ...commandRole }),
    ],
    ["buildContext", RSPACK_BUILD_CONTEXT],
    ["chunksContext", RSPACK_CHUNKS_CONTEXT],
    ["assetsContext", RSPACK_ASSETS_CONTEXT],
    ["devServerPort", process.env.RSPACK_DEVSERVER_PORT],
    ["projectConfigPath", projectConfigPath],
    ["configPath", configPath],
    ...((isTest &&
      initialEntrypoints.testClient &&
      initialEntrypoints.testServer && [
        ["testClientEntry", initialEntrypoints.testClient],
        ["testServerEntry", initialEntrypoints.testServer],
      ]) ||
      (isTest &&
        initialEntrypoints.testModule && [
          ["testEntry", initialEntrypoints.testModule],
        ]) || [
        ["mainClientEntry", initialEntrypoints.mainClient],
        ["mainClientHtmlEntry", initialEntrypoints.mainClientHtml],
        ["mainServerEntry", initialEntrypoints.mainServer],
      ]),
    ...((swcExternalHelpers && [["swcExternalHelpers", swcExternalHelpers]]) ||
      []),
    ...((isReactEnabled && [["isReactEnabled", isReactEnabled]]) || []),
    ...((isBlazeEnabled && [["isBlazeEnabled", isBlazeEnabled]]) || []),
    ...((isBlazeHotEnabled && [["isBlazeHotEnabled", isBlazeHotEnabled]]) ||
      []),
    ...((isTypescriptEnabled && [
      ["isTypescriptEnabled", isTypescriptEnabled],
    ]) ||
      []),
    ...((isAngularEnabled && [["isAngularEnabled", isAngularEnabled]]) || []),
    ...((isTsxEnabled && [["isTsxEnabled", isTsxEnabled]]) || []),
    ...((isJsxEnabled && [["isJsxEnabled", isJsxEnabled]]) || []),
    ...((isBundleVisualizerEnabled && [
      ["isBundleVisualizerEnabled", isBundleVisualizerEnabled],
      ["rsdoctorClientPort", process.env.RSDOCTOR_CLIENT_PORT],
      ["rsdoctorServerPort", process.env.RSDOCTOR_SERVER_PORT],
    ]) ||
      []),
  ].filter(Boolean);

  // Create environment variables object with bannerOutput
  const envs = {
    RSPACK_BANNER: JSON.stringify(getBuildFileContent({ ...module, ...env, ...side, role: FILE_ROLE.output }))
  };

  // Create params from pairs
  const params = pairs.flatMap(([key, val]) => [
    '--env',
    `${key}=${val}`
  ]);

  return { params, envs };
}

/**
 * Starts Rspack for client in serve mode
 * @param {Object} options - Options for client serve
 * @param {Function} options.onCompile - Callback function to be called when compilation is complete
 * @returns {Object} The client process object
 */
export function startRspackClientServe(options = {}) {
  const { onCompile } = options;
  // Get the current client process from global state
  const clientProcess = getGlobalState(GLOBAL_STATE_KEYS.CLIENT_PROCESS, null);

  // Skip if client process is already running
  if (clientProcess && isProcessRunning(clientProcess)) {
    return clientProcess;
  }

  const appDir = getMeteorAppDir();
  const configFile = getConfigFilePath();
  const { params, envs } = getRspackEnv({ isClient: true, isServer: false });
  const { command, args } = getNpxCommand(['rspack', 'serve', '--config', configFile, ...params]);
  const newClientProcess = spawnProcess(
    command,
    args, {
      cwd: appDir,
      env: inheritMeteorToolNodeFlags({ ...process.env, ...envs }),
      onStdout: (data) => {
        const { cleanedData, config } = parseMeteorRspackOutput(data);
        if (config && !!config?.devServerUrl) {
          logHmrServerStarted(config);
        }
        if (onCompile && config && (config?.compilationCount || 0) > 0) {
          onCompile(cleanedData, config);

          if (
            config?.name?.includes("client") &&
            !config?.hasErrors &&
            config?.isRebuild
          ) {
            getRunLog()?.logClientRestart();
          }
        }
        if (!cleanedData) return;
        if (shouldLogVerbose()) {
          logInfo(`[Rspack Client] ${cleanedData}`);
        } else {
          logCompilationOutput(cleanedData, 'client', config?.statsOverrided);
        }
      },
      onStderr: (data) => {
        const { cleanedData } = parseMeteorRspackOutput(data);
        if (!cleanedData) return;
        // Check if this is an EADDRINUSE error in development mode (which we want to completely ignore)
        if (isMeteorAppDevelopment() && cleanedData.includes('EADDRINUSE')) {
          if (shouldLogVerbose()) {
            logError(`[Rspack Client Error] ${cleanedData}`);
          } else {
            logError(stripRspackLabel(cleanedData));
          }
          return;
        }
        // Check if this is actually an informational message (like webpack-dev-server messages)
        if (cleanedData.includes('Loopback:') || cleanedData.includes('Project is running at:')) {
          if (shouldLogVerbose()) {
            logInfo(`[Rspack Client] ${cleanedData}`);
          } else {
            logRaw(stripRspackLabel(cleanedData));
          }
        } else {
          // Check if this is the "npm error could not determine executable to run" error
          if (cleanedData.includes('npm error could not determine executable to run')) {
            const errorMsg = '[Rspack Client Error] Try running "meteor npm install" to ensure rspack is available';
            if (shouldLogVerbose()) {
              logError(errorMsg);
            } else {
              logError('Try running "meteor npm install" to ensure rspack is available');
            }
            throw new Error(errorMsg);
          }
          if (shouldLogVerbose()) {
            logError(`[Rspack Client Error] ${cleanedData}`);
          } else {
            logError(stripRspackLabel(cleanedData));
          }
        }
      },
      onError: (err) => {
        const errorMsg = `Rspack Error: ${err.message}`;
        if (shouldLogVerbose()) {
          logError(errorMsg);
        } else {
          logError(err.message);
        }
        throw new Error(errorMsg);
      },
    });

  // Store the new process in global state
  setGlobalState(GLOBAL_STATE_KEYS.CLIENT_PROCESS, newClientProcess);

  return newClientProcess;
}

/**
 * Starts Rspack for server in build --watch mode
 * @param {Object} options - Options for server watch
 * @param {Function} options.onCompile - Callback function to be called when compilation is complete
 * @returns {Object} The server process object
 */
export function startRspackServerWatch(options = {}) {
  const { onCompile } = options;
  // Get the current server process from global state
  const serverProcess = getGlobalState(GLOBAL_STATE_KEYS.SERVER_PROCESS, null);

  // Skip if server process is already running
  if (serverProcess && isProcessRunning(serverProcess)) {
    return serverProcess;
  }

  const appDir = getMeteorAppDir();
  const configFile = getConfigFilePath();
  const { params, envs } = getRspackEnv({ isClient: false, isServer: true });
  const { command, args } = getNpxCommand(['rspack', 'build', '--watch', '--config', configFile, ...params]);
  const newServerProcess = spawnProcess(
    command,
    args, {
    cwd: appDir,
    env: inheritMeteorToolNodeFlags({ ...process.env, ...envs }),
    onStdout: (data) => {
      const { cleanedData, config } = parseMeteorRspackOutput(data);
      if (onCompile && config && (config?.compilationCount || 0) > 0) {
        onCompile(cleanedData, config);
      }
      if (!cleanedData) return;
      if (shouldLogVerbose()) {
        logInfo(`[Rspack Server] ${cleanedData}`);
      } else {
        logCompilationOutput(cleanedData, 'server', config?.statsOverrided);
      }
    },
    onStderr: (data) => {
      const { cleanedData } = parseMeteorRspackOutput(data);
      if (!cleanedData) return;
      // Check if this is actually an informational message (like webpack-dev-server messages)
      if (cleanedData.includes('Project is running at:')) {
        if (shouldLogVerbose()) {
          logInfo(`[Rspack Server] ${cleanedData}`);
        } else {
          logRaw(stripRspackLabel(cleanedData));
        }
      } else {
        // Check if this is the "npm error could not determine executable to run" error
        if (cleanedData.includes('npm error could not determine executable to run')) {
          const errorMsg = '[Rspack Server Error] Try running "meteor npm install" to ensure rspack is available';
          if (shouldLogVerbose()) {
            logError(errorMsg);
          } else {
            logError('Try running "meteor npm install" to ensure rspack is available');
          }
          throw new Error(errorMsg);
        }
        if (shouldLogVerbose()) {
          logError(`[Rspack Server Error] ${cleanedData}`);
        } else {
          logError(stripRspackLabel(cleanedData));
        }
      }
    },
    onError: (err) => {
      const errorMsg = `Rspack Error: ${err.message}`;
      if (shouldLogVerbose()) {
        logError(errorMsg);
      } else {
        logError(err.message);
      }
      throw new Error(errorMsg);
    }
  });

  // Store the new process in global state
  setGlobalState(GLOBAL_STATE_KEYS.SERVER_PROCESS, newServerProcess);

  return newServerProcess;
}

/**
 * Runs Rspack build for both client and server without watch mode
 * @param {Object} options - Options for the build
 * @param {boolean} options.isClient - Whether this is a client build
 * @param {boolean} options.isServer - Whether this is a server build
 * @param {boolean} options.isTestModule - Whether this is a test module
 * @param {Function} options.onCompile - Callback function to be called when compilation is complete
 * @param {boolean} options.watch - Whether to run Rspack in watch mode
 * @returns {Promise<void>} A promise that resolves when the build is complete
 * @throws {Error} If the build process fails
 */
export async function runRspackBuild({ isClient, isServer, isTest, isTestModule, isTestLike, onCompile, watch, label = 'Build' } = {}) {
  const appDir = getMeteorAppDir();
  const configFile = getConfigFilePath();

  const endpoint = isClient ? 'Client' : 'Server';
  // Use a promise to ensure Meteor waits until Rspack finishes
  return new Promise((resolve, reject) => {
    const { params, envs } = getRspackEnv({ isClient, isServer, isTest, isTestModule, isTestLike });
    const rspackArgs = [
      'rspack',
      'build',
      '--config',
      configFile,
      ...(watch && ['--watch']) || [],
      ...params,
    ].filter(Boolean);
    const { command, args } = getNpxCommand(rspackArgs);
    spawnProcess(
      command,
      args,
      {
      cwd: appDir,
      env: inheritMeteorToolNodeFlags({ ...process.env, ...envs }),
      onStdout: (data) => {
        const { cleanedData, config } = parseMeteorRspackOutput(data);
        if (onCompile && config && (config?.compilationCount || 0) > 0) {
          onCompile(cleanedData, config);
        }
        if (!cleanedData) return;
        if (shouldLogVerbose()) {
          logInfo(`[Rspack ${label} ${endpoint}] ${cleanedData}`);
        } else {
          logCompilationOutput(cleanedData, endpoint.toLowerCase(), config?.statsOverrided);
        }
      },
      onStderr: (data) => {
        const { cleanedData } = parseMeteorRspackOutput(data);
        if (!cleanedData) return;
        // Check if this is actually an informational message (like webpack-dev-server messages)
        if (cleanedData.includes('Project is running at:')) {
          if (shouldLogVerbose()) {
            logInfo(`[Rspack ${label} ${endpoint}] ${cleanedData}`);
          } else {
            logRaw(stripRspackLabel(cleanedData));
          }
        } else {
          // Check if this is the "npm error could not determine executable to run" error
          if (cleanedData.includes('npm error could not determine executable to run')) {
            const errorMsg = `[Rspack ${label} Error ${endpoint}] Try running "meteor npm install" to ensure rspack is available`;
            if (shouldLogVerbose()) {
              logError(errorMsg);
            } else {
              logError(`Try running "meteor npm install" to ensure rspack is available`);
            }
            throw new Error(errorMsg);
          }
          if (shouldLogVerbose()) {
            logError(`[Rspack ${label} Error ${endpoint}] ${cleanedData}`);
          } else {
            logError(stripRspackLabel(cleanedData));
          }
        }
      },
      onExit: (code) => {
        if (code === 0) {
          resolve();
        } else {
          const error = new Error(`Rspack ${label} failed in ${endpoint} with exit code ${code}`);
          if (shouldLogVerbose()) {
            logError(error.message);
          } else {
            logError(`Rspack ${label} failed with exit code ${code}`);
          }
          reject(error);
        }
      },
      onError: (err) => {
        if (shouldLogVerbose()) {
          logError(`Rspack ${label} ${endpoint} error: ${err.message}`);
        } else {
          logError(err.message);
        }
        reject(err);
      }
    });
  });
}

/**
 * Cleans up processes when the plugin is stopped
 * Stops any running client and server processes and clears their global state
 * @returns {void}
 */
export function cleanup() {
  const clientProcess = getGlobalState(GLOBAL_STATE_KEYS.CLIENT_PROCESS, null);
  if (clientProcess) {
    stopProcess(clientProcess);
    setGlobalState(GLOBAL_STATE_KEYS.CLIENT_PROCESS, null);
  }

  const serverProcess = getGlobalState(GLOBAL_STATE_KEYS.SERVER_PROCESS, null);
  if (serverProcess) {
    stopProcess(serverProcess);
    setGlobalState(GLOBAL_STATE_KEYS.SERVER_PROCESS, null);
  }
}
