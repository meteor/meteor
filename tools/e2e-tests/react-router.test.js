import { waitForMeteorOutput } from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';
import { assertBodyStyles, assertMetaTags } from "./assertions";

describe('R.Router App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'react-router',
    port: 3142,
    filePaths: { 
      client: 'client/main.jsx', 
      server: 'server/main.js',
      test: 'tests/main.app-test.js',
    },
    testFullApp: true,
    checkBundleFilePaths: [
      'programs/web.browser/app/1x1.png',
      'programs/web.browser/app/images/1x1.png',
      'programs/web.browser/app/docs/text.md',
      'programs/web.browser.legacy/app/1x1.png',
      'programs/web.browser.legacy/app/images/1x1.png',
      'programs/web.browser.legacy/app/docs/text.md',
    ],
    beforeAllBehavior: async () => {
      process.env.METEOR_PACKAGE_DIRS = './my-packages';
    },
    afterAllBehavior: async () => {
      process.env.METEOR_PACKAGE_DIRS = '';
    },
    customAssertions: {
      afterInit: async ({ result }) => {
        await waitForMeteorOutput(result.outputLines, /.*babel-plugin-react-compiler.*/);
      },
      afterRun: async ({ result, port }) => {
        await waitForReactEnvs(result.outputLines, { isTsxEnabled: true });
        // negated as cached output (babel.config.js)
        await waitForMeteorOutput(result.outputLines, /.*babel-plugin-react-compiler.*/, { negate: true });
        await assert404Page(port);
        // Less styles support
        await assertBodyStyles({
          'white-space': 'break-spaces',
        });
        // Meteor modules config
        await assertBodyStyles({
          'align-content': 'center',
        });
        // Custom html rspack plugin options
        await assertMetaTags({
          'theme-color': '#4285f4',
        });
        // default-package loading
        await waitForMeteorOutput(result.outputLines, /.*default-package loaded.*/);
        // custom-package loading
        await waitForMeteorOutput(result.outputLines, /.*custom-package loaded.*/);
        // resolve.extensions loading
        await waitForMeteorOutput(result.outputLines, /.*first\.jsx loaded.*/);
        // Check custom plugin gets loaded from rspack.config.override.js file
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/);
        // User-level devServer.onListening composes with meteor-rspack's
        // default: the default emits the HMR server URL, and the user's
        // hook emits its own marker. Both must appear.
        await waitForMeteorOutput(result.outputLines, /.*Started Rspack HMR server at.*/);
        await waitForMeteorOutput(result.outputLines, /.*\[user-onListening\] fired from rspack\.config\.js.*/);
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR output as enabled by default
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);
      },
      afterRunProduction: async ({ result, port }) => {
        await waitForReactEnvs(result.outputLines, { isTsxEnabled: true });
        await waitForMeteorOutput(result.outputLines, /.*babel-plugin-react-compiler.*/);
        await assert404Page(port, { isProductionMode: true });
        // Less styles support
        await assertBodyStyles({
          'white-space': 'break-spaces',
        });
        // Meteor modules config
        await assertBodyStyles({
          'align-content': 'center',
        });
        // Custom html rspack plugin options
        await assertMetaTags({
          'theme-color': '#4285f4',
        });
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
      afterTest: async ({ result }) => {
        await waitForReactEnvs(result.outputLines);
        // Check custom plugin gets loaded from rspack.config.override.js file
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/);
      },
      afterTestOnce: async ({ result }) => {
        await waitForReactEnvs(result.outputLines);
      },
      afterBuild: async ({ result }) => {
        await waitForReactEnvs(result.outputLines, { isTsxEnabled: true });
        await waitForMeteorOutput(result.outputLines, /.*babel-plugin-react-compiler.*/);
        // Check custom plugin gets loaded from rspack.config.override.js file
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/);
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
  if (options.isTsxEnabled) {
    await waitForMeteorOutput(
      outputLines,
      /.*isTsxEnabled:.*true.*/,
      options
    );
  }
}

/**
 * Helper function to assert that the 404 page is working correctly
 * @param {number} port - Port where the app is running
 * @param {Object} options - Options for the assertion
 * @param {boolean} options.isProductionMode - Whether the app is running in production mode
 * @returns {Promise<void>} - A promise that resolves when the assertion is complete
 */
async function assert404Page(port, options = {}) {
  const { isProductionMode = false } = options;
  const modeText = isProductionMode ? 'in production mode' : '';

  // Test 404 page
  console.log(`Testing 404 page${modeText ? ' ' + modeText : ''}...`);
  await page.goto(`http://localhost:${port}/not-found`);

  // Check for 404 message
  await page.waitForSelector('h1');
  const notFoundText = await page.$eval('h1', el => el.textContent);
  expect(notFoundText).toBe('404 - Page Not Found');

  // Check for additional text
  await page.waitForSelector('p');
  const paragraphText = await page.$eval('p', el => el.textContent);
  expect(paragraphText).toBe('The page you are looking for does not exist.');

  console.log(`✅ 404 page test passed${modeText ? ' ' + modeText : ''}`);
}
