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
import { assertMeteorReactApp, assertConsoleEval } from "./assertions";

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
    configFile: 'rspack.config.cjs',
    customAssertions: {
      afterRun: async ({ result }) => {
        await waitForReactEnvs(result.outputLines, { isJsxEnabled: true });

        // Check if images exist and return 200 status code
        await assertImagesExistAndLoad();

        // Check custom plugin is disabled with Meteor.disablePlugins
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/, { negate: true });
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR output as enabled by default
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);
      },
      afterRunProduction: async ({ result }) => {
        await waitForReactEnvs(result.outputLines, { isJsxEnabled: true });

        // Check if images exist and return 200 status code
        await assertImagesExistAndLoad();

        // Check custom plugin is disabled with Meteor.disablePlugins
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/, { negate: true });
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
      afterTest: async ({ result }) => {
        await waitForReactEnvs(result.outputLines);

        // Check custom plugin is disabled with Meteor.disablePlugins
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/, { negate: true });
      },
      afterTestOnce: async ({ result }) => {
        await waitForReactEnvs(result.outputLines);

        // Check custom plugin is disabled with Meteor.disablePlugins
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/, { negate: true });
      },
      afterBuild: async ({ result }) => {
        await waitForReactEnvs(result.outputLines, { isJsxEnabled: true });

        // Check custom plugin is disabled with Meteor.disablePlugins
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/, { negate: true });
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

/**
 * Helper function to assert that images exist in the DOM and return 200 status code when fetched
 * @returns {Promise<void>} - A promise that resolves when images are verified
 */
export async function assertImagesExistAndLoad() {
  await assertConsoleEval(`
    (async () => {
      // Get the image elements
      const imageGenerated = document.getElementById('image-generated');
      const imagePublic = document.getElementById('image-public');

      // Check if images exist
      if (!imageGenerated || !imagePublic) {
        return { success: false, error: 'Images not found in the DOM' };
      }

      // Function to check if an image URL returns 200
      const checkImageStatus = async (url) => {
        try {
          const response = await fetch(url);
          return { 
            url, 
            status: response.status, 
            ok: response.ok 
          };
        } catch (error) {
          return { 
            url, 
            status: 0, 
            ok: false, 
            error: error.message 
          };
        }
      };

      // Function to extract URL from background-image CSS property
      const extractUrlFromBackgroundImage = (backgroundImage) => {
        // Extract the URL from the background-image property (format: url("..."))
        const urlMatch = backgroundImage.match(/url\\(['"]?([^'"\\)]+)['"]?\\)/);
        return urlMatch ? urlMatch[1] : null;
      };

      // Get body's background-image
      const bodyStyle = getComputedStyle(document.body);
      const backgroundImage = bodyStyle.backgroundImage;
      const backgroundImageUrl = extractUrlFromBackgroundImage(backgroundImage);

      // Check both images and background image
      const generatedResult = await checkImageStatus(imageGenerated.src);
      const publicResult = await checkImageStatus(imagePublic.src);
      
      if (!backgroundImageUrl) {
        return { 
          ok: false, 
          error: 'No background image URL found on body element' 
         };
      } 
      
      const backgroundResult = await checkImageStatus(backgroundImageUrl);

      return {
        success: generatedResult.ok && publicResult.ok && backgroundResult.ok,
      };
    })()
  `, { success: true }, { exactMatch: false });
}
