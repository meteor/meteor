import {
  waitForMeteorOutput,
} from "./helpers";
import {
  assertFileChanged,
  assertFileUnchanged,
  assertManifest,
  assertMetaTags,
  assertServiceWorkerFile,
  assertServiceWorkerReady,
  assertServiceWorkerCaching,
  assertServiceWorkerPrecaching,
  assertFileInTree,
  captureFileMtime
} from "./assertions";
import { testMeteorRspackBundler } from './test-helpers';
import path from 'path';

// Shared state for sw.js stability checks across rebuild callbacks
let swJsMtime = null;

describe('Monorepo App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'monorepo',
    port: 3133,
    isMonorepo: true,
    filePaths: {
      client: 'app/client/main.jsx',
      server: 'app/server/main.js',
      test: 'app/tests/main.test.js'
    },
    checkBundleFilePaths: [
      'programs/web.browser/app/1x1.png',
      'programs/web.browser/app/images/1x1.png',
      'programs/web.browser/app/docs/text.md',
      'programs/web.browser/app/icon.png',
      'programs/web.browser/app/manifest.json',
      'programs/web.browser.legacy/app/1x1.png',
      'programs/web.browser.legacy/app/images/1x1.png',
      'programs/web.browser.legacy/app/docs/text.md',
      'programs/web.browser.legacy/app/icon.png',
      'programs/web.browser.legacy/app/manifest.json',
    ],
    configFile: 'rspack.config.cjs',
    customAssertions: {
      afterRun: async ({ result, port, tempDir }) => {
        // Check custom plugin gets loaded from rspack.config.override.cjs file
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/);

        // Verify PWA manifest is linked and contains expected fields
        await assertManifest(port, {
          name: 'Monorepo Test App',
          short_name: 'Monorepo',
          display: 'standalone',
          start_url: '/',
        });

        // Verify theme-color meta tag
        await assertMetaTags({ 'theme-color': '#000000' });

        // Verify service worker file is served
        await assertServiceWorkerFile(port);

        // Register the SW, verify it activates and controls the page after refresh
        await assertServiceWorkerReady(port);

        // Verify images from public/ are runtime-cached by the service worker
        await assertServiceWorkerCaching(port, {
          urls: ['/1x1.png', '/images/1x1.png'],
          cacheName: 'images',
        });

        // Verify icon.png is precached by the service worker (available without fetching)
        await assertServiceWorkerPrecaching(port, {
          urls: ['/icon.png'],
        });

        // Capture sw.js mtime after initial build for stability checks
        const appDir = path.join(tempDir, 'app');
        swJsMtime = await captureFileMtime(appDir, 'public/sw.js');
        console.log(`Captured sw.js mtime: ${swJsMtime}`);
      },
      afterRunRebuildClient: async ({ allConsoleLogs, tempDir }) => {
        // Check custom plugin gets loaded from rspack.config.override.cjs file
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:.*/);

        // Assert sw.js was NOT re-written during HMR client rebuild
        const appDir = path.join(tempDir, 'app');
        await assertFileUnchanged(appDir, 'public/sw.js', swJsMtime);
      },
      afterRunRebuildServer: async ({ tempDir }) => {
        // Assert sw.js was NOT re-written during server rebuild
        const appDir = path.join(tempDir, 'app');
        await assertFileUnchanged(appDir, 'public/sw.js', swJsMtime);
      },
      afterRunProduction: async ({ tempDir }) => {
        // Assert sw.js was regenerated on restart (different run = fresh sw.js)
        const appDir = path.join(tempDir, 'app');
        await assertFileChanged(appDir, 'public/sw.js', swJsMtime);
      },
      afterRunProductionRebuildClient: async ({ allConsoleLogs }) => {
        // Check for HMR to not be enabled in production-like mode
        await waitForMeteorOutput(allConsoleLogs, /.*HMR.*Updated modules:*/, { negate: true });
      },
      afterTest: async ({ result }) => {
        // Check custom plugin gets loaded from rspack.config.override.cjs file
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/);
      },
      afterBuild: async ({ result, buildOutputDir }) => {
        // Check custom plugin gets loaded from rspack.config.override.cjs file
        await waitForMeteorOutput(result.outputLines, /.*CustomConsoleLogPlugin.*/);

        // Verify sw.js exists somewhere in the production build output
        await assertFileInTree(path.join(buildOutputDir, 'bundle'), 'sw.js');
      },
    }
  }));
});
