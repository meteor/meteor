import {
  killProcessByPort,
  cleanupTempDir,
  killMeteorProcess,
  createMeteorApp,
  runMeteorApp,
  waitForMeteorOutput, waitForPlaywrightConsole
} from "./helpers";
import { testMeteorBundler, testMeteorRspackBundler } from './test-helpers';
import fs from 'fs-extra';
import path from 'path';
import { assertMeteorReactApp } from "./assertions";

describe('React App Bundling /', () => {

  // TODO: Create one test aside for all skeletons
  describe.skip('Meteor Creator /', () => {
    const PORT = 3100;

    beforeAll(async () => {
      // Ensure any process on the port is killed
      await killProcessByPort(PORT);
    });

    test('"meteor create" / should create a new Meteor react app', async () => {
      // Create a new Meteor app with --react example
      const result = await createMeteorApp('react', 'react');
      const newAppTempDir = result.tempDir;
      const newAppMeteorProcess = result.meteorProcess;

      // Wait for the process to complete
      await newAppMeteorProcess;

      // Check if the app directory exists
      const appDirExists = await fs.pathExists(newAppTempDir);
      expect(appDirExists).toBe(true);

      // Check if package.json exists and contains react
      const packageJsonPath = path.join(newAppTempDir, 'package.json');
      const packageJsonExists = await fs.pathExists(packageJsonPath);
      expect(packageJsonExists).toBe(true);

      const packageJson = await fs.readJson(packageJsonPath);
      expect(packageJson.dependencies).toHaveProperty('react');
      expect(packageJson.dependencies).toHaveProperty('react-dom');

      // Run the newly created app
      let runAppProcess = (await runMeteorApp(newAppTempDir, PORT))?.meteorProcess;

      // Assert that the Meteor React app is running correctly
      await assertMeteorReactApp(PORT);

      // Kill the meteor processes
      await killMeteorProcess(runAppProcess);
      if (newAppMeteorProcess) {
        await killMeteorProcess(newAppMeteorProcess);
      }

      // Ensure any process on the port is killed
      await killProcessByPort(PORT);

      // Clean up the temporary directory
      await cleanupTempDir(newAppTempDir);
    });
  });

  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'react',
    port: 3102,
    filePaths: { 
      client: 'client/main.jsx', 
      server: 'server/main.js',
      test: 'tests/main.js'
    },
    customAssertions: {
      afterRun: async ({ result }) => {
        await waitForReactEnvs(result.outputLines, { isJsxEnabled: true });
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR output as enabled by default
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);
      },
      afterRunProduction: async ({ result }) => {
        await waitForReactEnvs(result.outputLines, { isJsxEnabled: true });
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
      afterTest: async ({ result }) => {
        await waitForReactEnvs(result.outputLines);
      },
      afterTestOnce: async ({ result }) => {
        await waitForReactEnvs(result.outputLines);
      },
      afterBuild: async ({ result }) => {
        await waitForReactEnvs(result.outputLines, { isJsxEnabled: true });
      },
    }
  }));
});

/**
 * Helper function to wait for React environment output from both Rspack Client and Server
 * @param {string[]} outputLines - Array that will be populated with output lines
 * @param {Object} options - Options for waiting
 * @param {number} options.timeout - Maximum time to wait in milliseconds
 * @param {number} options.checkInterval - Interval between checks in milliseconds
 * @returns {Promise<void>} - A promise that resolves when react envs are enabled
 */
export async function waitForReactEnvs(outputLines, options = {}) {
  await waitForMeteorOutput(
    outputLines,
    /.*isReactEnabled:.*true.*/,
    options
  );
  if (options.isJsxEnabled) {
    await waitForMeteorOutput(
      outputLines,
      /.*isJsxEnabled:.*true.*/,
      options
    );
  }
}
