import {
  waitForMeteorOutput,
} from "./helpers";
import { testMeteorRspackBundler } from './test-helpers';
import {
  assertConsoleEval,
  assertMeteorStylesheetOwnership,
  assertStyles,
} from "./assertions";
import fs from 'fs-extra';
import path from 'path';

const RSPACK_CSS_MARKER = '--rspack-owned-nested-css';
const METEOR_CSS_MARKER = '--meteor-owned-nested-css';
const METEOR_MODULE_MARKER = '--meteor-module-css';
const IGNORED_CSS_MARKER = '--meteorignore-excluded-css';

describe('Vue App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'vue',
    port: 3132,
    filePaths: { 
      client: 'client/browser/entry/main.js',
      server: 'server/main.js',
      test: 'tests/main.js'
    },
    additionalMutableFilePaths: [
      'client/browser/entry/styles/deep/rspack-owned.css',
    ],
    customAssertions: {
      afterRun: async ({ tempDir }) => {
        // Verify Tailwind styles for ".p-8" element
        await assertStyles('.p-8', {
          ['padding']: '32px',
        });
        await assertVueNestedFiles(tempDir);

        const rspackCssPath = path.join(
          tempDir,
          'client/browser/entry/styles/deep/rspack-owned.css'
        );
        const pageInstance = await page.evaluate(() => {
          window.__rspackCssUpdatePageInstance = Math.random().toString(36);
          return window.__rspackCssUpdatePageInstance;
        });
        const rspackCss = await fs.readFile(rspackCssPath, 'utf8');
        await fs.writeFile(
          rspackCssPath,
          rspackCss.replace(': rspack-owned;', ': rspack-owned-updated;'),
          'utf8'
        );
        await page.waitForFunction(
          marker =>
            getComputedStyle(document.body)
              .getPropertyValue(marker)
              .trim() === 'rspack-owned-updated',
          RSPACK_CSS_MARKER
        );
        expect(
          await page.evaluate(() => window.__rspackCssUpdatePageInstance)
        ).toBe(pageInstance);
      },
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR output as enabled by default
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);
      },
      afterRunProduction: async ({ tempDir }) => {
        // Verify Tailwind styles for ".p-8" element
        await assertStyles('.p-8', {
          ['padding']: '32px',
        });
        await assertVueNestedFiles(tempDir);
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
    }
  }));
});

async function assertVueNestedFiles(tempDir) {
  await assertConsoleEval(
    `(() => {
      const styles = getComputedStyle(document.body);
      return {
        rspack: styles.getPropertyValue('${RSPACK_CSS_MARKER}').trim(),
        meteor: styles.getPropertyValue('${METEOR_CSS_MARKER}').trim(),
        meteorModule: styles.getPropertyValue('${METEOR_MODULE_MARKER}').trim(),
        ignored: styles.getPropertyValue('${IGNORED_CSS_MARKER}').trim(),
        nestedHtml: document.querySelector('meta[name="nested-static-html"]')?.content || '',
        ignoredHtml: document.querySelector('meta[name="ignored-static-html"]')?.content || '',
      };
    })()`,
    {
      rspack: 'rspack-owned',
      meteor: 'meteor-owned',
      meteorModule: 'meteor-module',
      ignored: '',
      nestedHtml: 'loaded',
      ignoredHtml: '',
    }
  );

  await assertMeteorStylesheetOwnership(tempDir, {
    meteorOwned: [METEOR_CSS_MARKER, METEOR_MODULE_MARKER],
    rspackOwned: [RSPACK_CSS_MARKER],
    ignored: [IGNORED_CSS_MARKER],
  });
}
