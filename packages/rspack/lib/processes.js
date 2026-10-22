/**
 * @module processes
 * @description Functions for managing Rspack processes
 */

import fs from "fs";
import path from "path";

const {
  spawnProcess,
  stopProcess,
  sendSignal,
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
  getNodeBinEnv,
  getMonorepoPath,
} = require('meteor/tools-core/lib/npm');

const {
  getGlobalState,
  setGlobalState
} = require('meteor/tools-core/lib/global-state');

const {
  GLOBAL_STATE_KEYS,
  getRspackChunksContext,
  getRspackAssetsContext,
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

// Rspack's native code prints this marker when it aborts, e.g. when its
// persistent cache was corrupted by a previous hard kill mid-write.
const RSPACK_PANIC_PATTERN = 'Panic occurred at runtime';
const RSPACK_UNSET_ENV = ['METEOR_IGNORE'];

/**
 * Builds the environment passed to Rspack child processes. METEOR_IGNORE is
 * consumed by meteor-tool, not Rspack, so it is omitted here and explicitly
 * removed again by spawnProcess after the parent environment is merged.
 * @param {Object} envs - Rspack-specific environment variables
 * @returns {Object} Environment variables for spawnProcess
 */
function getRspackSpawnEnv(envs) {
  const parentEnv = { ...process.env };
  delete parentEnv.METEOR_IGNORE;

  return inheritMeteorToolNodeFlags({
    ...parentEnv,
    ...getNodeBinEnv(),
    ...envs,
  });
}

/**
 * Creates a chunk-split-safe detector for the Rspack panic marker.
 * stderr arrives in arbitrary chunks, so the marker may straddle a
 * chunk boundary; a short tail of the previous chunk is kept to detect
 * that case.
 * @returns {Function} (chunk: string) => boolean
 */
function createPanicDetector() {
  let tail = '';
  return function sawPanic(chunk) {
    const haystack = tail + chunk;
    tail = haystack.slice(-(RSPACK_PANIC_PATTERN.length - 1));
    return haystack.includes(RSPACK_PANIC_PATTERN);
  };
}

/**
 * Fails the pending first-compilation promise for one side, so a dead
 * or panicked Rspack process surfaces as an error instead of leaving
 * waitForFirstCompilation hanging forever. See failFirstCompilation in
 * compilation.js.
 *
 * @param {string} side - 'client' or 'server'
 * @param {string} detail - What happened to the process
 * @returns {void}
 */
function failFirstCompilation(side, detail) {
  // Required lazily to avoid a circular import: compilation.js reaches
  // this module through config.js and build-context.js.
  require('./compilation').failFirstCompilation(side, detail);
}

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
  const isCI = !!(
    process.env.CI ||                      // Most CI providers (GitHub Actions, GitLab CI, Travis, CircleCI, Buildkite, Drone, Semaphore, etc.)
    process.env.GITHUB_ACTIONS ||          // GitHub Actions
    process.env.JENKINS_URL ||             // Jenkins
    process.env.TEAMCITY_VERSION ||        // TeamCity
    process.env.CODEBUILD_BUILD_ARN ||     // AWS CodeBuild
    process.env.BUILDER_OUTPUT ||           // Google Cloud Build
    process.env.TF_BUILD ||                // Azure Pipelines
    process.env.KUBERNETES_SERVICE_HOST    // Kubernetes
  );
  let message =
    `Could not find rspack.config.js, rspack.config.ts, rspack.config.mjs, or rspack.config.cjs.\n\n` +
    `Try running \`meteor update --npm\` followed by \`${installCommand}\` in your project directory and then re-run the build.\n` +
    `This will ensure @meteorjs/rspack is installed correctly.`;
  if (isCI) {
    message += `\n\nIt looks like you are running in a CI/Docker environment.\n` +
      `Make sure your Dockerfile or CI pipeline runs \`(meteor update --npm 2>/dev/null || true) && ${installCommand}\` before building.\n` +
      `See: https://docs.meteor.com/about/modern-build-stack/rspack-bundler-integration.html#docker`;
  }
  throw new Error(message);
}

/**
 * Gets the resolved Rspack CLI entrypoint path.
 *
 * This bypasses platform-specific npx wrappers so arguments such as config
 * paths with spaces are passed directly to Node without shell re-parsing.
 *
 * @returns {string} The path to @rspack/cli/bin/rspack.js
 * @throws {Error} If the Rspack CLI entrypoint cannot be found
 */
export function getRspackCliPath() {
  const appDir = getMeteorAppDir();

  try {
    // Dynamically resolve the exact bin path defined by the package.
    // Meteor's module system ignores the `paths` option and resolves unknown
    // top-level ids to themselves, so only an absolute path that exists on
    // disk can be trusted here.
    const pkgPath = require.resolve('@rspack/cli/package.json', { paths: [appDir] });
    if (path.isAbsolute(pkgPath)) {
      const pkg = require(pkgPath);
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.rspack;
      if (bin) {
        const binPath = path.join(path.dirname(pkgPath), bin);
        if (fs.existsSync(binPath)) {
          return binPath;
        }
      }
    }
  } catch (err) {
    // Fall through to hardcoded fallback if package.json isn't exported
  }

  const candidatePaths = [
    path.join(appDir, 'node_modules', '@rspack', 'cli', 'bin', 'rspack.js'),
  ];

  const monorepoPath = getMonorepoPath();
  if (monorepoPath) {
    candidatePaths.push(
      path.join(monorepoPath, 'node_modules', '@rspack', 'cli', 'bin', 'rspack.js'),
    );
  }

  // Walk up from the app directory so hoisted installs are still found when the
  // parent holding node_modules carries no monorepo marker. Nearest ancestor
  // wins, and the loop stops at the filesystem root.
  let currentDir = path.dirname(appDir);
  while (currentDir !== path.dirname(currentDir)) {
    candidatePaths.push(
      path.join(currentDir, 'node_modules', '@rspack', 'cli', 'bin', 'rspack.js'),
    );
    currentDir = path.dirname(currentDir);
  }

  for (const candidatePath of new Set(candidatePaths)) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    'Could not find @rspack/cli/bin/rspack.js. Try running `meteor npm install` to ensure rspack is available.'
  );
}

/**
 * Determines whether Rspack should bypass the npx wrapper.
 *
 * This is only needed on Windows when one of the CLI arguments contains
 * whitespace, which is where the wrapper path parsing breaks.
 *
 * @param {string[]} args - Arguments intended for the Rspack CLI
 * @param {string} [platform=process.platform] - Platform to resolve for
 * @returns {boolean} True if the npx wrapper should be bypassed
 */
export function shouldBypassRspackNpx(args, platform = process.platform) {
  return platform === 'win32' && args.some((arg) => /\s/.test(arg));
}

/**
 * Gets the command and arguments used to launch the Rspack CLI.
 *
 * @param {string[]} args - Arguments to pass to the Rspack CLI
 * @returns {{ command: string, args: string[] }} The command and argument list
 */
export function getRspackCliCommand(args) {
  if (shouldBypassRspackNpx(args)) {
    return {
      command: process.execPath,
      args: [getRspackCliPath(), ...args],
    };
  }

  return getNpxCommand(['rspack', ...args]);
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

  const module = isTest
    ? { isTest: true, isTestFullApp }
    : { isMain: true };
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
    // Mode-scoped so concurrent commands on one app dir (e.g. a dev server
    // plus `meteor test`) write their chunks/assets to separate directories
    // under public/ instead of overwriting each other.
    ["chunksContext", getRspackChunksContext(isTest, isTestFullApp)],
    ["assetsContext", getRspackAssetsContext(isTest, isTestFullApp)],
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
  const { command, args } = getRspackCliCommand(['serve', '--config', configFile, ...params]);
  const sawPanic = createPanicDetector();

  const newClientProcess = spawnProcess(
    command,
    args, {
      cwd: appDir,
      // Detach so the npx wrapper and the rspack devserver share a process
      // group separate from meteor-tool. stopProcess can then signal the whole
      // group, releasing the devserver port even when npx wouldn't forward
      // SIGTERM/SIGINT on its own.
      detached: process.platform !== 'win32',
      env: getRspackSpawnEnv(envs),
      unsetEnv: RSPACK_UNSET_ENV,
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
        if (sawPanic(data)) {
          // A panicked process may stay alive in serve mode, so the
          // exit handler alone would not unblock the first compile.
          failFirstCompilation('client', 'reported a fatal panic');
        }
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
      onExit: (code, signal) => {
        failFirstCompilation(
          'client',
          `exited unexpectedly (${signal ? `signal ${signal}` : `code ${code}`})`
        );
      },
      onError: (err) => {
        failFirstCompilation('client', `failed to start (${err.message})`);
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
  const { command, args } = getRspackCliCommand(['build', '--watch', '--config', configFile, ...params]);
  const sawPanic = createPanicDetector();

  const newServerProcess = spawnProcess(
    command,
    args, {
    cwd: appDir,
    // Detach for the same reason as the client serve process; see comment there.
    detached: process.platform !== 'win32',
    env: getRspackSpawnEnv(envs),
    unsetEnv: RSPACK_UNSET_ENV,
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
      if (sawPanic(data)) {
        // A panicked process may stay alive in watch mode, so the
        // exit handler alone would not unblock the first compile.
        failFirstCompilation('server', 'reported a fatal panic');
      }
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
    onExit: (code, signal) => {
      failFirstCompilation(
        'server',
        `exited unexpectedly (${signal ? `signal ${signal}` : `code ${code}`})`
      );
    },
    onError: (err) => {
      failFirstCompilation('server', `failed to start (${err.message})`);
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
// Deliberately not async: callers that fire-and-forget rely on the
// returned promise being the same one that carries the no-op rejection
// handler attached below; an async wrapper promise would not.
export function runRspackBuild({ isClient, isServer, isTest, isTestModule, isTestLike, onCompile, watch, label = 'Build' } = {}) {
  const appDir = getMeteorAppDir();
  const configFile = getConfigFilePath();

  const endpoint = isClient ? 'Client' : 'Server';
  const sawPanic = createPanicDetector();
  // Use a promise to ensure Meteor waits until Rspack finishes
  const buildPromise = new Promise((resolve, reject) => {
    const { params, envs } = getRspackEnv({ isClient, isServer, isTest, isTestModule, isTestLike });
    const rspackArgs = [
      'build',
      '--config',
      configFile,
      ...(watch && ['--watch']) || [],
      ...params,
    ].filter(Boolean);
    const { command, args } = getRspackCliCommand(rspackArgs);
    spawnProcess(
      command,
      args,
      {
      cwd: appDir,
      env: getRspackSpawnEnv(envs),
      unsetEnv: RSPACK_UNSET_ENV,
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
        if (sawPanic(data)) {
          // In watch mode a panicked process may stay alive and never
          // exit, so the exit handler alone would not unblock the
          // first compile.
          failFirstCompilation(endpoint.toLowerCase(), 'reported a fatal panic');
        }
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
      onExit: (code, signal) => {
        // Even a clean exit must fail a still-pending first compile
        // (e.g. a watch process that exits before compiling), so this
        // runs before branching on the exit code; it no-ops after a
        // successful compilation.
        failFirstCompilation(
          endpoint.toLowerCase(),
          `exited (${signal ? `signal ${signal}` : `code ${code}`})`
        );
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
        failFirstCompilation(
          endpoint.toLowerCase(),
          `failed to start (${err.message})`
        );
        if (shouldLogVerbose()) {
          logError(`Rspack ${label} ${endpoint} error: ${err.message}`);
        } else {
          logError(err.message);
        }
        reject(err);
      }
    });
  });

  // Some call sites (production run, tests) start this build without
  // awaiting the returned promise and rely on the first-compile
  // promises instead; mark rejections as handled so they never surface
  // as unhandled rejections there, while awaiting callers still see
  // the rejection.
  buildPromise.catch(() => {});
  return buildPromise;
}

/**
 * Cleans up processes when the plugin is stopped
 * Stops any running client and server processes and clears their global state.
 * Awaits both stops in parallel so the parent waits for the rspack devserver
 * to release its port before exiting on SIGTERM/SIGHUP/SIGINT.
 * @returns {Promise<void>}
 */
export async function cleanup() {
  const clientProcess = getGlobalState(GLOBAL_STATE_KEYS.CLIENT_PROCESS, null);
  const serverProcess = getGlobalState(GLOBAL_STATE_KEYS.SERVER_PROCESS, null);

  setGlobalState(GLOBAL_STATE_KEYS.CLIENT_PROCESS, null);
  setGlobalState(GLOBAL_STATE_KEYS.SERVER_PROCESS, null);

  await Promise.all([
    clientProcess ? stopProcess(clientProcess) : Promise.resolve(),
    serverProcess ? stopProcess(serverProcess) : Promise.resolve(),
  ]);
}

/**
 * Synchronous best-effort variant for signal handlers. Sends SIGTERM to each
 * rspack child's process group on POSIX (so the npx wrapper and the rspack
 * binary it spawned both receive it) so the devserver port is released even
 * if the parent terminates before the async cleanup awaits resolve.
 * @returns {void}
 */
export function cleanupSync() {
  for (const key of [GLOBAL_STATE_KEYS.CLIENT_PROCESS, GLOBAL_STATE_KEYS.SERVER_PROCESS]) {
    const proc = getGlobalState(key, null);
    if (!proc || !proc.pid || !isProcessRunning(proc)) continue;

    sendSignal(proc, 'SIGTERM');
  }
}
