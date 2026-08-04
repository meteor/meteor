import { waitForMeteorOutput } from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';
import { assertBodyStyles, assertMetaTags } from "./assertions";
import fs from 'fs-extra';
import path from 'path';

const NATIVE_FALSE_POSITIVE_MARKER =
  'RSPACK_NATIVE_FALSE_POSITIVE_BUNDLED';

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
    runBuiltBundle: true,
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
        // Do not assert babel.config.js output is absent on the second run:
        // rspack persistent-cache reuse across separate `meteor run`
        // invocations is not deterministic in CI, so a negated wait here can
        // hang for the full test timeout. See afterInit for the positive check.
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
        await waitForMeteorOutput(result.outputLines, /.*bcrypt runtime hash \$2.*/);
        await waitForMeteorOutput(
          result.outputLines,
          new RegExp(NATIVE_FALSE_POSITIVE_MARKER)
        );
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
        await waitForMeteorOutput(result.outputLines, /.*bcrypt runtime hash \$2.*/);
        await waitForMeteorOutput(
          result.outputLines,
          new RegExp(NATIVE_FALSE_POSITIVE_MARKER)
        );
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
        await waitForMeteorOutput(result.outputLines, /.*bcrypt runtime hash \$2.*/);
        await waitForMeteorOutput(
          result.outputLines,
          new RegExp(NATIVE_FALSE_POSITIVE_MARKER)
        );
        // Check custom plugin gets loaded from rspack.config.override.js file
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/);
      },
      afterTestOnce: async ({ result }) => {
        await waitForReactEnvs(result.outputLines);
        await waitForMeteorOutput(result.outputLines, /.*bcrypt runtime hash \$2.*/);
        await waitForMeteorOutput(
          result.outputLines,
          new RegExp(NATIVE_FALSE_POSITIVE_MARKER)
        );
      },
      afterBuild: async ({ buildOutputDir, result, bundleRuntime }) => {
        await waitForReactEnvs(result.outputLines, { isTsxEnabled: true });
        await waitForMeteorOutput(
          bundleRuntime.outputLines,
          /.*bcrypt runtime hash \$2.*/
        );
        await waitForMeteorOutput(
          bundleRuntime.outputLines,
          new RegExp(NATIVE_FALSE_POSITIVE_MARKER)
        );
        expect(
          await directoryContains(
            path.join(
              buildOutputDir,
              'bundle',
              'programs',
              'server'
            ),
            NATIVE_FALSE_POSITIVE_MARKER
          )
        ).toBe(true);
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

async function directoryContains(directory, needle) {
  if (!(await fs.pathExists(directory))) return false;

  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === 'node_modules') continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await directoryContains(entryPath, needle)) return true;
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      (await fs.readFile(entryPath, 'utf8')).includes(needle)
    ) {
      return true;
    }
  }

  return false;
}
