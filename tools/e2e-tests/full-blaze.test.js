import {
  waitForMeteorOutput,
} from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';
import {
  assertConsoleEval,
  assertMeteorStylesheetOwnership,
} from './assertions';

const METEOR_LESS_MARKER = '--meteor-owned-nested-less';
const IGNORED_LESS_MARKER = '--meteorignore-excluded-less';

describe('Full Blaze App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'full-blaze',
    port: 3122,
    filePaths: { 
      client: 'client/main.js', 
      server: 'server/main.js',
      test: 'imports/api/links/methods.tests.js'
    },
    customAssertions: {
      afterRun: async ({ result, tempDir }) => {
        await waitForBlazeEnvs(result.outputLines);
        await assertNestedMeteorLessOwnership(tempDir);
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled as incompatible with Blaze
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/,  { negate: true });
      },
      afterRunProduction: async ({ result, tempDir }) => {
        await waitForBlazeEnvs(result.outputLines);
        await assertNestedMeteorLessOwnership(tempDir);
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
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

async function assertNestedMeteorLessOwnership(tempDir) {
  await assertConsoleEval(
    `(() => {
      const styles = getComputedStyle(document.body);
      return {
        meteor: styles.getPropertyValue('${METEOR_LESS_MARKER}').trim(),
        ignored: styles.getPropertyValue('${IGNORED_LESS_MARKER}').trim(),
      };
    })()`,
    {
      meteor: 'meteor-owned',
      ignored: '',
    }
  );

  await assertMeteorStylesheetOwnership(tempDir, {
    meteorOwned: [METEOR_LESS_MARKER],
    ignored: [IGNORED_LESS_MARKER],
  });
}
