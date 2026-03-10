import {
  waitForMeteorOutput,
} from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';
import { assertBodyStyles, assertFileExist } from "./assertions";
import path from "path";
import fs from "fs";

const isCI = process.env.GITHUB_ACTIONS === 'true';

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
    assetsContext: 'assets',
    chunksContext: 'chunks',
    configFile: 'rspack.config.ts',
    customAssertions: {
      afterCreate({ tempDir }) {
        if (isCI) {
          const rspackConfigPath = path.join(tempDir, 'rspack.config.ts');
          // Remove the TsCheckerRspackPlugin plugin as is resource-intense, CI gets exhausted and fails
          let configContent = fs.readFileSync(rspackConfigPath, 'utf8');
          configContent = configContent.replace(
            /\s*new\s+TsCheckerRspackPlugin\(\)/,
            '',
          );
          fs.writeFileSync(rspackConfigPath, configContent);
        }
      },
      afterRun: async ({ result, tempDir }) => {
        // SCSS styles support
        await assertBodyStyles({
          'white-space': 'break-spaces',
        });
        await waitForTypeScriptEnvs(result.outputLines, { isTsxEnabled: true });
        await waitForTypeScriptErrorFree(result.outputLines);
        await assertFileExist(tempDir, ".meteor/local/types");
        // Portable build: Meteor.isDevelopment and Meteor.isProduction must not be defined
        await waitForMeteorOutput(
          result.outputLines,
          /[^ ]*Meteor.isDevelopment[^ ]*: [^ ]*false[^ ]*/,
          { negate: true }
        );
        await waitForMeteorOutput(
          result.outputLines,
          /[^ ]*Meteor.isProduction[^ ]*: [^ ]*true[^ ]*/,
          { negate: true }
        );
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
        // Portable build: Meteor.isDevelopment and Meteor.isProduction must not be defined
        await waitForMeteorOutput(
          result.outputLines,
          /[^ ]*Meteor.isDevelopment[^ ]*: [^ ]*false[^ ]*/,
          { negate: true }
        );
        await waitForMeteorOutput(
          result.outputLines,
          /[^ ]*Meteor.isProduction[^ ]*: [^ ]*true[^ ]*/,
          { negate: true }
        );
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
        // Portable build: Meteor.isDevelopment and Meteor.isProduction must not be defined
        await waitForMeteorOutput(
          result.outputLines,
          /[^ ]*Meteor.isDevelopment[^ ]*: [^ ]*false[^ ]*/,
          { negate: true }
        );
        await waitForMeteorOutput(
          result.outputLines,
          /[^ ]*Meteor.isProduction[^ ]*: [^ ]*true[^ ]*/,
          { negate: true }
        );
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
  // Disable this check in CI as tsPlugin is resource-intensive and CI gets exhausted and fails
  if (isCI) return;

  await waitForMeteorOutput(
    outputLines,
    /.*\[Rspack.*Client].*no.*errors.*found.*/,
    options
  );
  await waitForMeteorOutput(
    outputLines,
    /.*\[Rspack.*Client].*no.*errors.*found.*/,
    options
  );
  console.log(`Custom Plugin usage: ts-checker-rspack-plugin`);
}
