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
    skipEnvCheck: true,
    // Test custom NODE_ENV compilation
    env: {
      meteorRun: { NODE_ENV: 'development' },
      meteorRunProduction: { NODE_ENV: 'production' },
      meteorTest: { NODE_ENV: 'development' },
      meteorTestOnce: { NODE_ENV: 'test' },
      meteorBuild: { NODE_ENV: 'development' },
    },
    customAssertions: {
      afterRun: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
        await waitForMeteorOutput(result.outputLines, /\[i\] Rspack mode: development/);
        await waitForMeteorOutput(result.outputLines, /[^ ]*Meteor.isDevelopment[^ ]*: [^ ]*true[^ ]*/);
        await waitForMeteorOutput(result.outputLines, /[^ ]*Meteor.isProduction[^ ]*: [^ ]*false[^ ]*/);
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR output as enabled by default
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);
      },
      afterRunProduction: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
        await waitForMeteorOutput(result.outputLines, /\[i\] Rspack mode: production/);
        await waitForMeteorOutput(
          result.outputLines,
          /[^ ]*Meteor.isDevelopment[^ ]*: [^ ]*false[^ ]*/
        );
        await waitForMeteorOutput(
          result.outputLines,
          /[^ ]*Meteor.isProduction[^ ]*: [^ ]*true[^ ]*/
        );
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
      afterTest: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
        await waitForMeteorOutput(result.outputLines, /\[i\] Rspack mode: development/);
        await waitForMeteorOutput(result.outputLines, /[^ ]*Meteor.isDevelopment[^ ]*: [^ ]*true[^ ]*/);
        await waitForMeteorOutput(result.outputLines, /[^ ]*Meteor.isProduction[^ ]*: [^ ]*false[^ ]*/);
      },
      afterTestOnce: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
        await waitForMeteorOutput(result.outputLines, /\[i\] Rspack mode: development/);
        await waitForMeteorOutput(result.outputLines, /[^ ]*Meteor.isDevelopment[^ ]*: [^ ]*true[^ ]*/);
        await waitForMeteorOutput(result.outputLines, /[^ ]*Meteor.isProduction[^ ]*: [^ ]*false[^ ]*/);
      },
      afterBuild: async ({ result }) => {
        await assertFileExtensionModuleRules(result.outputLines);
        // Force development mode on build
        await waitForMeteorOutput(result.outputLines, /\[i\] Rspack mode: development/);
        await waitForMeteorOutput(result.outputLines, /[^ ]*Meteor.isDevelopment[^ ]*: [^ ]*true[^ ]*/);
        await waitForMeteorOutput(result.outputLines, /[^ ]*Meteor.isProduction[^ ]*: [^ ]*false[^ ]*/);
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
