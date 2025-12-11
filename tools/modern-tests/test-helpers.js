/**
 * This file contains helper functions for testing Meteor applications.
 * It provides reusable test patterns for both the test apps.
 */

import {
  appendFileContent,
  buildMeteorApp,
  cleanupTempDir,
  createMeteorApp,
  killMeteorProcess,
  killProcessByPort,
  runMeteorApp,
  runMeteorCommand,
  runMeteorTests,
  setupMeteorApp,
  wait,
  waitForMeteorOutput,
  waitForPlaywrightConsole
} from "./helpers";
import {
  assertBodyStyles,
  assertFileExist,
  assertMeteorApp,
  assertMeteorReactApp,
  assertRspackScriptTag
} from "./assertions";
import fs from "fs-extra";
import path from "path";
import execa from "execa";
import waitOn from "wait-on";

/**
 * Helper function to set up and run tests for the Meteor Bundler
 * @param {Object} options - Options for the test
 * @param {string} options.appName - Name of the app ('react' or 'typescript')
 * @param {number} options.port - Port to run the app on
 * @param {Function} options.customAssertions - Custom assertions to run after the app is started
 * @param {Function} options.beforeAllBehavior - Additional behavior to run in beforeAll
 * @param {Function} options.afterAllBehavior - Additional behavior to run in afterAll
 * @returns {Function} - Jest test function
 */
export function testMeteorBundler(options) {
  const { appName, port, customAssertions, beforeAllBehavior, afterAllBehavior } = options;

  return () => {
    let meteorProcess;
    let tempDir;

    beforeAll(async () => {
      // Run additional beforeAll behavior
      if (beforeAllBehavior) {
        await beforeAllBehavior({ tempDir, port });
      }

      // Ensure any process on the port is killed
      await killProcessByPort(port);

      // Setup the Meteor app
      tempDir = (await setupMeteorApp(appName))?.tempDir;
    });

    afterAll(async () => {
      // Clean up the temporary directory
      await cleanupTempDir(tempDir);

      // Run additional afterAll behavior
      if (afterAllBehavior) {
        await afterAllBehavior({ tempDir, port });
      }
    });

    test(`"meteor run" / should start the app`, async () => {
      // Run the Meteor app
      meteorProcess = (await runMeteorApp(tempDir, port))?.meteorProcess;

      // Assert that the Meteor app is running correctly
      await assertMeteorReactApp(port, { title: appName });

      // Run custom assertions if provided
      if (customAssertions) {
        await customAssertions({ tempDir, port, meteorProcess });
      }

      // Kill the meteor process
      await killMeteorProcess(meteorProcess);

      // Ensure any process on the port is killed
      await killProcessByPort(port);
    });
  };
}

/**
 * Helper function to set up and run tests for the Meteor+Rspack Bundler
 * @param {Object} options - Options for the test
 * @param {string} options.appName - Name of the app ('react', 'typescript', etc)
 * @param {number} options.port - Port to run the app on
 * @param {Object} options.filePaths - File paths for the app
 * @param {string} options.filePaths.client - Client file path (e.g., 'client/main.jsx')
 * @param {string} options.filePaths.server - Server file path (e.g., 'server/main.js')
 * @param {string} options.filePaths.test - Test file path (e.g., 'tests/main.js')
 * @param {Object} options.customMessages - Custom messages for console logs
 * @param {string} options.customMessages.devClient - Message for development client
 * @param {string} options.customMessages.devServer - Message for development server
 * @param {string} options.customMessages.prodClient - Message for production client
 * @param {string} options.customMessages.prodServer - Message for production server
 * @param {string} options.customMessages.test - Message for test
 * @param {Function} options.customAssertions - Custom assertions to run after each test
 * @param {boolean} options.verbose - Whether to enable verbose output (default: true)
 * @param {boolean} options.testFullApp - Whether to run tests with the --full-app flag (default: false)
 * @param {boolean} options.testBundleVisualizer - Whether to run tests with bundle-visualizer in production mode (default: false)
 * @param {string[]} options.checkBundleFilePaths - Array of file paths to check for existence in the bundle
 * @param {Function} options.beforeAllBehavior - Additional behavior to run in beforeAll
 * @param {Function} options.afterAllBehavior - Additional behavior to run in afterAll
 * @returns {Function} - Jest test function
 */
export function testMeteorRspackBundler(options) {
  const {
    appName,
    port,
    isMonorepo = false,
    filePaths = {
      client: 'client/main.jsx',
      server: 'server/main.js',
      test: 'tests/main.js',
      testClient: undefined,
      testServer: undefined,
    },
    customMessages = {
      devClient: "Hello from dev client",
      devServer: "Hello from dev server",
      prodClient: "Hello from prod client",
      prodServer: "Hello from prod server",
      test: "Hello from test",
      testClient: "Hello from test client",
      testServer: "Hello from test server",
    },
    customUpdates = {
      devClient: (message) => `if (Meteor.isDevelopment) console.log("${message}");`,
      devServer: (message) => `if (Meteor.isDevelopment) console.log("${message}");`,
      prodClient: (message) => `if (Meteor.isProduction) console.log("${message}");`,
      prodServer: (message) => `if (Meteor.isProduction) console.log("${message}");`,
      test: (message) => `console.log("${message}");`
    },
    customAssertions,
    // Some existing tests may fail if this is not set
    verbose = true,
    // Option to run tests with --full-app flag
    testFullApp = false,
    // Option to test with bundle-visualizer in production mode
    testBundleVisualizer = false,
    // Array of file paths to check for existence in the bundle
    checkBundleFilePaths = [],
    // Additional behavior for beforeAll and afterAll
    beforeAllBehavior,
    afterAllBehavior,
    // Build directory (default: '_build')
    buildDir = '_build',
    // Rspack config file (default: 'rspack.config.js')
    configFile = 'rspack.config.js',
  } = options;

  return () => {
    let meteorProcess;
    let tempDir;
    let appDir;

    beforeAll(async () => {
      // Run additional beforeAll behavior
      if (beforeAllBehavior) {
        await beforeAllBehavior({ tempDir, port });
      }

      // Ensure any process on the port is killed
      await killProcessByPort(port);
      await killProcessByPort('8080');

      // Setup the Meteor app
      tempDir = (await setupMeteorApp(appName, { isMonorepo }))?.tempDir;

      // Add Rspack package
      appDir = isMonorepo ? path.join(tempDir, 'app') : tempDir;
      await runMeteorCommand('add', ['rspack'], appDir, { checkExitCode: true });

      // Set meteor.modern.verbose to true
      if (verbose) {
        await execa('npm', ['pkg', 'delete', 'meteor.modern'], { cwd: appDir });
        await execa('npm', ['pkg', 'set', 'meteor.modern.verbose=true'], { cwd: appDir });
      }

      // Run the Meteor app to install Rspack
      const result = await runMeteorApp(tempDir, port, {
        waitForOutput: "=> App running at:",
        isMonorepo
      });
      meteorProcess = result.meteorProcess;

      // Wait for a margin
      await wait(1000);

      // Assert that the config files exists
      await assertFileExist(appDir, '.gitignore', { content: buildDir });
      await assertFileExist(appDir, configFile, { content: '@meteorjs/rspack' });

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterInit) {
        await customAssertions.afterInit({ tempDir, port, meteorProcess, result });
      }

      // Kill the meteor process
      await killMeteorProcess(meteorProcess);

      // Ensure any process on the port is killed
      await killProcessByPort(port);
      await killProcessByPort('8080');
    });

    afterAll(async () => {
      // Clean up the temporary directory
      await cleanupTempDir(tempDir);

      // Run additional afterAll behavior
      if (afterAllBehavior) {
        await afterAllBehavior({ tempDir, port });
      }
    });

    test(`"meteor run" / should run and rebuild the app with Rspack`, async () => {
      // Run the Meteor app and wait for "restarted at" output
      const result = await runMeteorApp(tempDir, port, {
        waitForOutput: "=> App running at:",
        isMonorepo
      });
      meteorProcess = result.meteorProcess;

      // Wait for a margin
      await wait(500);

      // Assert that the app files exists
      await assertFileExist(appDir, `${buildDir}/main-dev/client-entry.js`);
      await assertFileExist(appDir, `${buildDir}/main-dev/client-rspack.js`);
      await assertFileExist(appDir, `${buildDir}/main-dev/client-meteor.js`);
      await assertFileExist(appDir, `${buildDir}/main-dev/server-entry.js`);
      await assertFileExist(appDir, `${buildDir}/main-dev/server-rspack.js`);
      await assertFileExist(appDir, `${buildDir}/main-dev/server-meteor.js`);

      // Assert that the Meteor app is running correctly
      await assertMeteorReactApp(port, { title: appName });

      // Assert that the app is using Rspack
      await assertRspackScriptTag(port, true);

      // Assert that the body has the expected CSS styles
      await assertBodyStyles({
        'padding': '10px',
        'font-family': 'sans-serif'
      });

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterRun) {
        await customAssertions.afterRun({ tempDir, port, meteorProcess, result });
      }

      // Update the client code
      await appendFileContent(tempDir, filePaths.client, {
        content: customUpdates.devClient(customMessages.devClient),
      });
      const consoleLogs = await waitForPlaywrightConsole(customMessages.devClient, { returnAllLogs: true });

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterRunRebuildClient) {
        await customAssertions.afterRunRebuildClient({
          tempDir,
          port,
          meteorProcess,
          result,
          allConsoleLogs: consoleLogs.allLogs
        });
      }

      // Update the server code
      await appendFileContent(tempDir, filePaths.server, {
        content: customUpdates.devServer(customMessages.devServer),
      });
      await waitForMeteorOutput(
        result.outputLines,
        customMessages.devServer
      );

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterRunRebuildServer) {
        await customAssertions.afterRunRebuildServer({ tempDir, port, meteorProcess, result });
      }

      if (verbose) {
        await waitForMeteorOutput(
          result.outputLines,
          /.*isDevelopment:.*true.*/
        );
        await waitForMeteorOutput(
          result.outputLines,
          /.*isRun:.*true.*/
        );
      }

      // Wait for a margin
      await wait(500);

      // Kill the meteor process
      await killMeteorProcess(meteorProcess);

      // Ensure any process on the port is killed
      await killProcessByPort(port);
      await killProcessByPort('8080');
    });

    test(`"meteor run --production" / should run and rebuild the app with Rspack in production`, async () => {
      // Run the Meteor app and wait for "restarted at" output
      const result = await runMeteorApp(tempDir, port, {
        waitForOutput: "=> App running at:",
        commandOptions: ['--production'],
        isMonorepo
      });
      meteorProcess = result.meteorProcess;

      // Wait for a margin
      await wait(500);

      // Assert that the app files exists
      await assertFileExist(appDir, `${buildDir}/main-prod/client-entry.js`);
      await assertFileExist(appDir, `${buildDir}/main-prod/client-rspack.js`);
      await assertFileExist(appDir, `${buildDir}/main-prod/client-meteor.js`);
      await assertFileExist(appDir, `${buildDir}/main-prod/server-entry.js`);
      await assertFileExist(appDir, `${buildDir}/main-prod/server-rspack.js`);
      await assertFileExist(appDir, `${buildDir}/main-prod/server-meteor.js`);
      await assertFileExist(appDir, `${buildDir}/main-prod/index.html`);

      await assertFileExist(tempDir, filePaths.server);

      // Assert that the Meteor app is running correctly
      await assertMeteorReactApp(port, { title: appName });

      // Assert that the app is using Rspack
      await assertRspackScriptTag(port, false);

      // Assert that the body has the expected CSS styles
      await assertBodyStyles({
        'padding': '10px',
        'font-family': 'sans-serif'
      });

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterRunProduction) {
        await customAssertions.afterRunProduction({ tempDir, port, meteorProcess, result });
      }

      // Update the client code
      await appendFileContent(tempDir, filePaths.client, {
        content: customUpdates.prodClient(customMessages.prodClient),
      });
      const consoleLogs = await waitForPlaywrightConsole(customMessages.prodClient, { returnAllLogs: true });

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterRunProductionRebuildClient) {
        await customAssertions.afterRunProductionRebuildClient({
          tempDir,
          port,
          meteorProcess,
          result,
          allConsoleLogs: consoleLogs.allLogs
        });
      }

      // Update the server code
      await appendFileContent(tempDir, filePaths.server, {
        content: customUpdates.prodServer(customMessages.prodServer),
      });
      await waitForMeteorOutput(
        result.outputLines,
        customMessages.prodServer
      );

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterRunProductionRebuildServer) {
        await customAssertions.afterRunProductionRebuildServer({ tempDir, port, meteorProcess, result });
      }

      if (verbose) {
        await waitForMeteorOutput(
          result.outputLines,
          /.*isProduction:.*true.*/
        );
        await waitForMeteorOutput(
          result.outputLines,
          /.*isRun:.*true.*/
        );
      }

      // Wait for a margin
      await wait(500);

      // Kill the meteor process
      await killMeteorProcess(meteorProcess);

      // Ensure any process on the port is killed
      await killProcessByPort(port);
      await killProcessByPort('8080');
    });

    // Conditional test for bundle-visualizer in production mode
    if (testBundleVisualizer) {
      test(`"meteor run --extra-packages bundle-visualizer --production" / should run with bundle-visualizer in production mode`, async () => {
        // Run the Meteor app with bundle-visualizer in production mode
        const result = await runMeteorApp(tempDir, port, {
          waitForOutput: "=> App running at:",
          commandOptions: ['--extra-packages', 'bundle-visualizer', '--production'],
          isMonorepo
        });
        meteorProcess = result.meteorProcess;

        // Wait for a margin
        await wait(500);

        // Assert that the app files exists
        await assertFileExist(appDir, `${buildDir}/main-prod/client-entry.js`);
        await assertFileExist(appDir, `${buildDir}/main-prod/client-rspack.js`);
        await assertFileExist(appDir, `${buildDir}/main-prod/client-meteor.js`);
        await assertFileExist(appDir, `${buildDir}/main-prod/server-entry.js`);
        await assertFileExist(appDir, `${buildDir}/main-prod/server-rspack.js`);
        await assertFileExist(appDir, `${buildDir}/main-prod/server-meteor.js`);
        await assertFileExist(appDir, `${buildDir}/main-prod/index.html`);

        // Assert that the Meteor app is running correctly
        await assertMeteorReactApp(port, { title: appName });

        // Wait for bundle-visualizer ports to be available
        console.log('Waiting for bundle-visualizer ports 8081 and 8082 to be available...');
        try {
          await waitOn({
            resources: [
              `http-get://localhost:8081`,
              `http-get://localhost:8082`
            ],
            timeout: 30000
          });
          console.log('Bundle-visualizer ports 8081 and 8082 are available');
        } catch (error) {
          console.error('Error waiting for bundle-visualizer ports:', error);
          throw error;
        }

        // Run custom assertions if provided
        if (customAssertions && customAssertions.afterRunBundleVisualizer) {
          await customAssertions.afterRunBundleVisualizer({ tempDir, port, meteorProcess, result });
        }

        // Wait for a margin
        await wait(500);

        // Kill the meteor process
        await killMeteorProcess(meteorProcess);

        // Ensure any process on the port is killed
        await killProcessByPort(port);
        await killProcessByPort('8080');
        // await killProcessByPort('8081');
        // await killProcessByPort('8082');
      });
    }

    test(`"meteor test${testFullApp ? ' --full-app' : ''}" / should run tests with Rspack`, async () => {
      const result = await runMeteorTests(tempDir, port, {
        waitForOutput: "=> App running at:",
        commandOptions: testFullApp ? ['--full-app'] : [],
        checkTestResults: false,
        isMonorepo
      });
      meteorProcess = result.meteorProcess;

      // Wait for a margin
      await wait(500);

      const isTestModule = filePaths.test && !filePaths.testClient && !filePaths.testServer;

      // Assert that the app files exists
      await assertFileExist(appDir, `${buildDir}/test/client-entry.js`);
      await assertFileExist(appDir, `${buildDir}/test/client-rspack.js`);
      await assertFileExist(appDir, `${buildDir}/test/client-meteor.js`);
      await assertFileExist(appDir, `${buildDir}/test/server-entry.js`);
      await assertFileExist(appDir, `${buildDir}/test/server-rspack.js`);
      await assertFileExist(appDir, `${buildDir}/test/server-meteor.js`);

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterTest) {
        await customAssertions.afterTest({ tempDir, port, meteorProcess, result });
      }

      // Update the test code
      if (isTestModule) {
        await appendFileContent(tempDir, filePaths.test, {
          content: customUpdates.test(customMessages.test),
        });
        await waitForMeteorOutput(result.outputLines, customMessages.test);
      } else {
        await appendFileContent(tempDir, filePaths.testClient, {
          content: customUpdates.test(customMessages.testClient),
        });
        await waitForMeteorOutput(
          result.outputLines,
          customMessages.testClient
        );

        await appendFileContent(tempDir, filePaths.testServer, {
          content: customUpdates.test(customMessages.testServer),
        });
        await waitForMeteorOutput(
          result.outputLines,
          customMessages.testServer
        );
      }

      if (verbose) {
        await waitForMeteorOutput(
          result.outputLines,
          /.*isDevelopment:.*true.*/
        );
        await waitForMeteorOutput(
          result.outputLines,
          /.*isTest:.*true.*/
        );
      }

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterTestRebuild) {
        await customAssertions.afterTestRebuild({ tempDir, port, meteorProcess, result });
      }

      // Kill the meteor process
      await killMeteorProcess(meteorProcess);

      // Ensure any process on the port is killed
      await killProcessByPort(port);
    });

    test(`"meteor test${testFullApp ? ' --full-app' : ''} --once" / should run tests once with Rspack`, async () => {
      // Test the app with Rspack once
      const result = await runMeteorTests(tempDir, port, {
        waitForOutput: "=> App running at:",
        commandOptions: testFullApp ? ['--full-app', '--once'] : ['--once'],
        checkTestResults: true,
        isMonorepo
      });

      // Wait for a margin
      await wait(500);

      // Assert that the app files exists
      await assertFileExist(appDir, `${buildDir}/test/client-entry.js`);
      await assertFileExist(appDir, `${buildDir}/test/client-rspack.js`);
      await assertFileExist(appDir, `${buildDir}/test/client-meteor.js`);
      await assertFileExist(appDir, `${buildDir}/test/server-entry.js`);
      await assertFileExist(appDir, `${buildDir}/test/server-rspack.js`);
      await assertFileExist(appDir, `${buildDir}/test/server-meteor.js`);

      if (verbose) {
        await waitForMeteorOutput(
          result.outputLines,
          /.*isDevelopment:.*true.*/
        );
        await waitForMeteorOutput(
          result.outputLines,
          /.*isTest:.*true.*/
        );
      }

      // Run custom assertions if provided
      if (customAssertions && customAssertions.afterTestOnce) {
        await customAssertions.afterTestOnce({ tempDir, port, result });
      }

      // Ensure any process on the port is killed
      await killProcessByPort(port);
    });

    test(`"meteor build" / should build the app with Rspack`, async () => {
      // Build the app with Rspack
      const { buildOutputDir, processResult: result } = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory'],
        captureOutput: true,
        isMonorepo
      });

      // Wait for a margin
      await wait(500);

      if (verbose) {
        await waitForMeteorOutput(
          result.outputLines,
          /.*isProduction:.*true.*/
        );
        await waitForMeteorOutput(
          result.outputLines,
          /.*isBuild:.*true.*/
        );
      }

      try {
        // Assert that the build output directory exists
        const buildDirExists = await fs.pathExists(buildOutputDir);
        expect(buildDirExists).toBe(true);

        // Assert that the main.js file exists
        expect(await fs.pathExists(`${buildOutputDir}/bundle/main.js`)).toBe(true);

        // Assert that the server/package.json file exists
        expect(await fs.pathExists(`${buildOutputDir}/bundle/programs/server/package.json`)).toBe(true);
        expect(await fs.pathExists(`${buildOutputDir}/bundle/programs/server/program.json`)).toBe(true);

        // Assert that the [web.browser|web.browser.legacy]/program.json file exists
        expect(await fs.pathExists(`${buildOutputDir}/bundle/programs/web.browser/program.json`)).toBe(true);
        expect(await fs.pathExists(`${buildOutputDir}/bundle/programs/web.browser.legacy/program.json`)).toBe(true);

        // Run npm install in the server directory
        console.log('Running npm install in the server directory...');
        const serverDir = path.join(buildOutputDir, 'bundle', 'programs', 'server');
        const npmInstallResult = await execa('npm', ['install'], {
          cwd: serverDir,
          stdio: 'inherit',
          shell: true,
        });

        // Check if the npm install command was successful
        expect(npmInstallResult.exitCode).toBe(0);

        // Check for the existence of specified file paths in the bundle
        const fileCheckResults = {};
        if (checkBundleFilePaths.length > 0) {
          console.log(`Checking for existence of ${checkBundleFilePaths.length} file paths in the bundle...`);

          // Check each file path
          for (const filePath of checkBundleFilePaths) {
            const fullPath = path.join(buildOutputDir, 'bundle', filePath);
            try {
              const exists = await fs.pathExists(fullPath);
              fileCheckResults[filePath] = exists;
              console.log(`Checking file ${filePath}: ${exists ? 'exists' : 'does not exist'}`);
              expect(exists).toBe(true);
            } catch (error) {
              console.error(`Error checking file ${filePath}:`, error);
              fileCheckResults[filePath] = false;
              expect(false).toBe(true); // This will fail the test
            }
          }
        }

        // Run custom assertions if provided
        if (customAssertions && customAssertions.afterBuild) {
          await customAssertions.afterBuild({ tempDir, buildOutputDir, result, fileCheckResults });
        }
      } finally {
        // Clean up the build output directory
        await cleanupTempDir(buildOutputDir);
      }
    });
  };
}

/**
 * Helper function to test a Meteor skeleton
 * @param {Object} options - Options for the test
 * @param {string} options.skeletonName - Name of the skeleton to test (e.g., 'react', 'apollo', 'vue')
 * @param {string} options.title - Title to use for assertions (defaults to skeletonName if not provided)
 * @param {number} options.port - Port to run the app on
 * @param {Object} options.filePaths - File paths for the app
 * @param {string} options.filePaths.client - Client file path (e.g., 'client/main.jsx')
 * @param {string} options.filePaths.server - Server file path (e.g., 'server/main.js')
 * @param {string} options.filePaths.test - Test file path (e.g., 'tests/main.js')
 * @param {Object} options.customAssertions - Custom assertions to run after each step
 * @param {Function} options.customAssertions.afterCreate - Custom assertions to run after creating the app
 * @param {Function} options.customAssertions.afterRun - Custom assertions to run after running the app
 * @param {Function} options.customAssertions.afterRunProduction - Custom assertions to run after running the app in production mode
 * @param {Function} options.customAssertions.afterTestOnce - Custom assertions to run after running tests once
 * @param {Function} options.customAssertions.afterBuild - Custom assertions to run after building the app
 * @param {string[]} options.checkBundleFilePaths - Array of file paths to check for existence in the bundle
 * @param {Function} options.beforeAllBehavior - Additional behavior to run in beforeAll
 * @param {Function} options.afterAllBehavior - Additional behavior to run in afterAll
 * @returns {Function} - Jest test function
 */
export function testMeteorSkeleton(options) {
  const {
    skeletonName,
    title = skeletonName, // Default to skeletonName if title is not provided
    port,
    filePaths = {
      client: "client/main.jsx",
      server: "server/main.js",
      test: "tests/main.js"
    },
    customAssertions = {},
    checkBodyStyles = true,
    checkBundleFilePaths = [],
    beforeAllBehavior,
    afterAllBehavior,
  } = options;

  return () => {
    let meteorProcess;
    let tempDir;

    beforeAll(async () => {
      // Run additional beforeAll behavior
      if (beforeAllBehavior) {
        await beforeAllBehavior({ tempDir, port });
      }

      // Ensure any process on the port is killed
      await killProcessByPort(port);
    });

    afterAll(async () => {
      // Clean up the temporary directory
      if (tempDir) {
        await cleanupTempDir(tempDir);
      }

      // Run additional afterAll behavior
      if (afterAllBehavior) {
        await afterAllBehavior({ tempDir, port });
      }
    });

    test(`"meteor create --${skeletonName}" / should create a new Meteor ${skeletonName} app`, async () => {
      // Create a new Meteor app with the specified skeleton
      const result = await createMeteorApp(skeletonName, skeletonName);
      tempDir = result.tempDir;
      const newAppMeteorProcess = result.meteorProcess;

      // Wait for the process to complete
      await newAppMeteorProcess;

      // Check if the app directory exists
      const appDirExists = await fs.pathExists(tempDir);
      expect(appDirExists).toBe(true);

      // Check if package.json exists
      const packageJsonPath = path.join(tempDir, "package.json");
      const packageJsonExists = await fs.pathExists(packageJsonPath);
      expect(packageJsonExists).toBe(true);

      // Run custom assertions if provided
      if (customAssertions.afterCreate) {
        await customAssertions.afterCreate({ tempDir, packageJsonPath });
      }
    });

    test(`"meteor run" / should run the ${skeletonName} app`, async () => {
      // Run the newly created app
      const result = await runMeteorApp(tempDir, port, {
        waitForOutput: "=> App running at:"
      });
      meteorProcess = result.meteorProcess;

      // Wait for a margin
      await wait(500);

      // Assert that the Meteor app is running correctly
      await assertMeteorApp(port, { title });

      if (checkBodyStyles) {
        // Assert that the body has the expected CSS styles
        await assertBodyStyles({
          "padding": "10px",
          "font-family": "sans-serif"
        });
      }

      // Run custom assertions if provided
      if (customAssertions.afterRun) {
        await customAssertions.afterRun({ tempDir, port, meteorProcess, result });
      }

      // Kill the meteor process
      await killMeteorProcess(meteorProcess);

      // Ensure any process on the port is killed
      await killProcessByPort(port);
    });

    test(`"meteor run --production" / should run the ${skeletonName} app in production mode`, async () => {
      // Run the app in production mode
      const result = await runMeteorApp(tempDir, port, {
        waitForOutput: "=> App running at:",
        commandOptions: ["--production"]
      });
      meteorProcess = result.meteorProcess;

      // Wait for a margin
      await wait(500);

      // Assert that the Meteor app is running correctly
      await assertMeteorApp(port, { title });

      if (checkBodyStyles) {
        // Assert that the body has the expected CSS styles
        await assertBodyStyles({
          "padding": "10px",
          "font-family": "sans-serif"
        });
      }

      // Run custom assertions if provided
      if (customAssertions.afterRunProduction) {
        await customAssertions.afterRunProduction({ tempDir, port, meteorProcess, result });
      }

      // Kill the meteor process
      await killMeteorProcess(meteorProcess);

      // Ensure any process on the port is killed
      await killProcessByPort(port);
    });

    test(`"meteor test --once" / should run tests once for the ${skeletonName} app`, async () => {
      // Install playwright as a dev dependency
      console.log("Installing playwright as a dev dependency...");
      await execa.command("meteor npm i --save-dev playwright", {
        cwd: tempDir,
        stdio: "inherit",
        shell: true
      });

      // Run tests once for the app
      const result = await runMeteorTests(tempDir, port, {
        waitForOutput: "=> App running at:",
        commandOptions: ["--once"],
        checkTestResults: true
      });

      // Wait for a margin
      await wait(500);

      // Run custom assertions if provided
      if (customAssertions.afterTestOnce) {
        await customAssertions.afterTestOnce({ tempDir, port, result });
      }

      // Ensure any process on the port is killed
      await killProcessByPort(port);
    });

    test(`"meteor build" / should build the ${skeletonName} app`, async () => {
      // Build the app
      const { buildOutputDir, processResult: result } = await buildMeteorApp(tempDir, {
        commandOptions: ["--directory"],
        captureOutput: true
      });

      // Wait for a margin
      await wait(500);

      try {
        // Assert that the build output directory exists
        const buildDirExists = await fs.pathExists(buildOutputDir);
        expect(buildDirExists).toBe(true);

        // Assert that the main.js file exists
        expect(await fs.pathExists(`${buildOutputDir}/bundle/main.js`)).toBe(true);

        // Assert that the server/package.json file exists
        expect(await fs.pathExists(`${buildOutputDir}/bundle/programs/server/package.json`)).toBe(true);
        expect(await fs.pathExists(`${buildOutputDir}/bundle/programs/server/program.json`)).toBe(true);

        // Assert that the [web.browser|web.browser.legacy]/program.json file exists
        expect(await fs.pathExists(`${buildOutputDir}/bundle/programs/web.browser/program.json`)).toBe(true);
        expect(await fs.pathExists(`${buildOutputDir}/bundle/programs/web.browser.legacy/program.json`)).toBe(true);

        // Check for the existence of specified file paths in the bundle
        const fileCheckResults = {};
        if (checkBundleFilePaths.length > 0) {
          console.log(`Checking for existence of ${checkBundleFilePaths.length} file paths in the bundle...`);

          // Check each file path
          for (const filePath of checkBundleFilePaths) {
            const fullPath = path.join(buildOutputDir, 'bundle', filePath);
            try {
              const exists = await fs.pathExists(fullPath);
              fileCheckResults[filePath] = exists;
              console.log(`Checking file ${filePath}: ${exists ? 'exists' : 'does not exist'}`);
              expect(exists).toBe(true);
            } catch (error) {
              console.error(`Error checking file ${filePath}:`, error);
              fileCheckResults[filePath] = false;
              expect(false).toBe(true); // This will fail the test
            }
          }
        }

        // Run custom assertions if provided
        if (customAssertions.afterBuild) {
          await customAssertions.afterBuild({ tempDir, buildOutputDir, result, fileCheckResults });
        }
      } finally {
        // Clean up the build output directory
        await cleanupTempDir(buildOutputDir);
      }
    });
  };
}
