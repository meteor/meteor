import fs from 'fs-extra';
import path from 'path';
import { testMeteorRspackBundler } from './test-helpers';
import { assertBrowserEntrypoints, legacyUserAgent } from './legacy-helpers';

const assertEntrypoints = ({ port }) =>
  assertBrowserEntrypoints(`http://localhost:${port}/`);

describe('Other / Legacy App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'legacy',
    port: 3146,
    // Preserve the fixture's modern.webArchOnly: false setting.
    verbose: false,
    filePaths: {
      client: 'client/modern.ts',
      server: 'server/main.js',
      testServer: 'tests/server.ts',
    },
    customAssertions: {
      afterRun: assertEntrypoints,
      afterRunProduction: assertEntrypoints,
      afterRunProductionRebuildClient: assertEntrypoints,
      afterRunBuiltApp: assertEntrypoints,
      async afterTest({ tempDir, port }) {
        // The test driver's normal browser covers testModule.client. Select a
        // legacy program too, so its separate test module must actually pass.
        const legacyPage = await browser.newPage({ userAgent: legacyUserAgent });
        const sourcePath = path.join(tempDir, 'tests/legacy.ts');
        const source = await fs.readFile(sourcePath, 'utf8');
        try {
          await legacyPage.goto(`http://localhost:${port}/`);
          await legacyPage.waitForSelector('html[data-legacy-test="passed"]');
          await legacyPage.waitForFunction(() => window.testsDone);
          expect(await legacyPage.evaluate(() => window.testFailures)).toBe(0);
          await fs.writeFile(sourcePath, source.replace("'passed'", "'rebuilt'"));
          await legacyPage.waitForSelector('html[data-legacy-test="rebuilt"]');
          await legacyPage.waitForFunction(() => window.testsDone);
          expect(await legacyPage.evaluate(() => window.testFailures)).toBe(0);
        } finally {
          await legacyPage.close();
          await fs.writeFile(sourcePath, source);
        }
      },
    },
  }));
});
