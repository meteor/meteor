import {
  waitForMeteorOutput,
} from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';
import { assertBodyStyles, assertFileExist } from "./assertions";

describe('TypeScript App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'typescript',
    port: 3112,
    filePaths: { 
      client: 'client/main.tsx', 
      server: 'server/main.ts',
      testClient: 'tests/client.ts',
      testServer: 'tests/server.ts',
    },
    buildDir: 'build',
    configFile: 'rspack.config.cjs',
    customAssertions: {
      afterRun: async ({ result, tempDir }) => {
        // SCSS styles support
        await assertBodyStyles({
          'white-space': 'break-spaces',
        });
        await waitForTypeScriptEnvs(result.outputLines, { isTsxEnabled: true });
        await waitForTypeScriptErrorFree(result.outputLines);
        await assertFileExist(tempDir, '.meteor/local/types');
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR output as enabled by default
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);
      },
      afterRunProduction: async ({ result }) => {
        // SCSS styles support
        await assertBodyStyles({
          'white-space': 'break-spaces',
        });
        await waitForTypeScriptEnvs(result.outputLines, { isTsxEnabled: true });
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
      afterTest: async ({ result }) => {
        await waitForTypeScriptEnvs(result.outputLines);
      },
      afterTestOnce: async ({ result }) => {
        await waitForTypeScriptEnvs(result.outputLines);
      },
      afterBuild: async ({ result }) => {
        await waitForTypeScriptEnvs(result.outputLines, { isTsxEnabled: true });
      },
    }
  }));
});

/**
 * Helper function to wait for TypeScript environment output from both Rspack Client and Server
 * @param {string[]} outputLines - Array that will be populated with output lines
 * @param {Object} options - Options for waiting
 * @param {number} options.timeout - Maximum time to wait in milliseconds
 * @param {number} options.checkInterval - Interval between checks in milliseconds
 * @returns {Promise<void>} - A promise that resolves when both client and server are error-free
 */
export async function waitForTypeScriptEnvs(outputLines, options = {}) {
  await waitForMeteorOutput(
    outputLines,
    /.*isTypescriptEnabled:.*true.*/,
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
 * Helper function to wait for TypeScript error-free output from both Rspack Client and Server
 * @param {string[]} outputLines - Array that will be populated with output lines
 * @param {Object} options - Options for waiting
 * @param {number} options.timeout - Maximum time to wait in milliseconds
 * @param {number} options.checkInterval - Interval between checks in milliseconds
 * @returns {Promise<void>} - A promise that resolves when both client and server are error-free
 */
export async function waitForTypeScriptErrorFree(outputLines, options = {}) {
  await waitForMeteorOutput(
    outputLines,
    /.*\[Rspack.*Client].*No TypeScript errors found\./,
    options
  );
  await waitForMeteorOutput(
    outputLines,
    /.*\[Rspack.*Server].*No TypeScript errors found\./,
    options
  );
  console.log(`Custom Plugin usage: ts-checker-rspack-plugin`);
}
