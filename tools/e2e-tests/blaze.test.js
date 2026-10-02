import {
  waitForMeteorOutput,
} from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';

describe('BasicBlaze App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'blaze',
    port: 3122,
    filePaths: { 
      client: 'client/main.js', 
      server: 'server/main.js',
      test: 'tests/main.js'
    },
    customAssertions: {
      afterRun: async ({ result }) => {
        await waitForBlazeEnvs(result.outputLines);
        await assertNestedBlazeFiles();
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled as incompatible with Blaze
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
      afterRunProduction: async ({ result }) => {
        await waitForBlazeEnvs(result.outputLines);
        await assertNestedBlazeFiles();
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled as incompatible with Blaze
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
      afterTest: async ({ result }) => {
        await waitForBlazeEnvs(result.outputLines);
      },
      afterTestOnce: async ({ result }) => {
        await waitForBlazeEnvs(result.outputLines);
      },
      afterBuild: async ({ result }) => {
        await waitForBlazeEnvs(result.outputLines);
      },
    }
  }));
});

/**
 * Helper function to wait for Blaze environment output from both Rspack Client and Server
 * @param {string[]} outputLines - Array that will be populated with output lines
 * @param {Object} options - Options for waiting
 * @param {number} options.timeout - Maximum time to wait in milliseconds
 * @param {number} options.checkInterval - Interval between checks in milliseconds
 * @returns {Promise<void>} - A promise that resolves when blaze envs are enabled
 */
export async function waitForBlazeEnvs(outputLines, options = {}) {
  await waitForMeteorOutput(
    outputLines,
    /.*isBlazeEnabled:.*true.*/,
    options
  );
}

async function assertNestedBlazeFiles() {
  await page.waitForSelector('.nested-widget');
  await page.waitForSelector('.deeply-nested-widget');

  const styles = await page.evaluate(() => ({
    nestedColor: getComputedStyle(
      document.querySelector('.nested-widget')
    ).color,
    deepBorderWidth: getComputedStyle(
      document.querySelector('.deeply-nested-widget')
    ).borderTopWidth,
    ignoredOutlineStyle: getComputedStyle(
      document.querySelector('.meteorignore-sentinel')
    ).outlineStyle,
    ignoredTemplatePresent:
      typeof Template.ignoredByMeteorIgnore !== 'undefined',
  }));

  expect(styles).toEqual({
    nestedColor: 'rgb(0, 128, 0)',
    deepBorderWidth: '7px',
    ignoredOutlineStyle: 'none',
    ignoredTemplatePresent: false,
  });
}
