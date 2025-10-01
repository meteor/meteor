import {
  waitForMeteorOutput,
} from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';

describe('Babel App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'babel',
    port: 3122,
    filePaths: { 
      client: 'client/main.jsx', 
      server: 'server/main.js',
      test: 'tests/main.js'
    },
    configFile: 'rspack.config.mjs',
    customAssertions: {
      afterRun: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR output as enabled by default
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);
      },
      afterRunProduction: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
      afterTest: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
      },
      afterTestOnce: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
      },
      afterBuild: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
      },
    }
  }));
});

/**
 * Helper function to assert that output contains expected file extension moduel rules
 * @param {string[]} outputLines - Array of output lines to check
 * @returns {Promise<void>}
 */
export async function assertFileExtensionModuleRules(outputLines) {
  // Check for custom and residual rules
  await waitForMeteorOutput(outputLines, '/\\.(js|jsx)$/i');
  await waitForMeteorOutput(outputLines, '/\\.(tsx|ts|mts|cts|mjs|cjs)$/i');
  await waitForMeteorOutput(outputLines, '/\\.(graphql|gql)$/i');
  await waitForMeteorOutput(outputLines, '/\\.(?:[mc]?js|jsx|[mc]?ts|tsx)$/i', { negate: true });
}
