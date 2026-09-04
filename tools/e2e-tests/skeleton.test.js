/**
 * This file contains tests for different Meteor skeletons.
 * It uses the testMeteorSkeleton function to test the creation, running, testing, and building
 * of different Meteor skeletons (apollo, react, etc.).
 */

import { assertServiceWorkerFile, assertStyles } from './assertions';
import {
  cleanupTempDir,
  createMeteorApp,
  killMeteorProcess,
  killProcessByPort,
  resetPlaywrightPage,
  runMeteorApp,
  waitForMeteorOutput,
} from './helpers';
import { linkLocalRspack, testMeteorSkeleton } from './test-helpers';
import fs from 'fs-extra';
import path from 'path';

async function assertTsgoTypeChecker({ tempDir, meteorProcess, result }) {
  const probePath = path.join(tempDir, 'imports/ts-checker-e2e-probe.ts');

  try {
    const errorOutputStart = result.outputLines.length;
    await fs.outputFile(
      probePath,
      'export const tsCheckerProbe: string = 123;\n',
    );
    await waitForMeteorOutput(result.outputLines, /TS2322/, {
      meteorProcess,
      startIndex: errorOutputStart,
    });
  } finally {
    await fs.remove(probePath);
  }
}

// The pwa skeleton registers `/sw.js?dev=1` in development (installable, but
// the bundle is never cached so hot code push keeps working) and `/sw.js` in
// production (offline caching of the app shell and static assets).
async function assertPwaInstallable({ port, swPath, prefix = '' }) {
  const origin = `http://localhost:${port}`;
  const swUrl = `${origin}${swPath}`;

  // The manifest link is what makes the browser offer installation. The <h1> is
  // static markup, so wait for the app to boot: under a prefix the link is
  // rewritten in Meteor.startup.
  const manifestHref = `${prefix}/manifest.webmanifest`;
  await page.waitForFunction(
    (href) => document.querySelector('link[rel="manifest"]')?.getAttribute('href') === href,
    manifestHref,
    { timeout: 15_000 },
  );
  const manifest = await page.request.get(`${origin}${manifestHref}`);
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toContain('pwa');

  await assertServiceWorkerFile(port, { swPath });

  // The skeleton's own registration (Meteor.startup) must activate, take
  // control of the page (`clients.claim()`) and keep it across a reload.
  const isControlledBy = (url) => navigator.serviceWorker.controller?.scriptURL === url;
  await page.waitForFunction(isControlledBy, swUrl, { timeout: 15_000 });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(isControlledBy, swUrl, { timeout: 15_000 });
  console.log(`✅ Service worker controlling the page (${swUrl})`);
}

// Production only: once the app shell has been served through the worker, it
// must load again with the server gone. Killing the server is what takes the
// worker's own fetches offline — Playwright's `setOffline` only reaches the page.
async function assertPwaLoadsOffline({ port, meteorProcess }) {
  await killMeteorProcess(meteorProcess);
  await killProcessByPort(port);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('h1');
  expect(await page.textContent('h1')).toBe('Welcome to Meteor!');
  console.log('✅ App shell served from the service worker cache with the server down');
}

describe('Meteor Skeletons /', () => {
  describe(
    'Angular Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'angular',
      port: 3213,
      filePaths: {
        client: 'client/main.ts',
        server: 'server/main.ts',
        test: 'tests/main.ts',
      },
    }),
  );

  describe(
    'Apollo Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'apollo',
      port: 3201,
      filePaths: {
        client: 'client/main.jsx',
        server: 'server/main.js',
        test: 'tests/main.js',
      },
    }),
  );

  describe(
    'Babel Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'babel',
      port: 3212,
      filePaths: {
        client: 'client/main.jsx',
        server: 'server/main.js',
        test: 'tests/main.js',
      },
    }),
  );

  describe(
    "Other / Bare Skeleton /",
    testMeteorSkeleton({
      skeletonName: "bare",
      port: 3219,
      checkAppTitle: false,
      checkBodyStyles: false,
      skipTestClient: true,
      skipBuildCacheCheck: true,
    })
  );

  describe(
    'Blaze Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'blaze',
      port: 3202,
      filePaths: {
        client: 'client/main.js',
        server: 'server/main.js',
        test: 'tests/main.js',
      },
    }),
  );

  describe(
    'ChakraUI Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'chakra-ui',
      port: 3203,
      filePaths: {
        client: 'client/main.jsx',
        server: 'server/main.js',
        test: 'tests/main.js',
      },
      checkBodyStyles: false,
    }),
  );

  describe(
    'Coffeescript Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'coffeescript',
      port: 3211,
      filePaths: {
        client: 'client/main.coffee',
        server: 'server/main.coffee',
        test: 'tests/main.coffee',
      },
    }),
  );

  describe(
    'Other / Full Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'full',
      port: 3204,
      filePaths: {
        client: 'client/main.js',
        server: 'server/main.js',
        test: 'imports/api/links/methods.tests.js',
      },
    })
  );

  describe(
    'PWA Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'pwa',
      port: 3214,
      filePaths: {
        client: 'client/main.js',
        server: 'server/main.js',
        test: 'tests/main.js',
      },
      customAssertions: {
        afterRun: ({ port }) =>
          assertPwaInstallable({ port, swPath: '/sw.js?dev=1' }),
        afterRunProduction: async ({ port, meteorProcess }) => {
          await assertPwaInstallable({ port, swPath: '/sw.js' });
          await assertPwaLoadsOffline({ port, meteorProcess });
        },
      },
    }),
  );

  // A path-prefixed ROOT_URL (https://example.com/app) serves everything under
  // the prefix, so every PWA URL has to follow. Production only: in development
  // the boilerplate injects the Rspack client script without the prefix
  // (packages/boilerplate-generator/template-web.browser.js), so no app code
  // runs under a prefix until that is fixed. The rest of the lifecycle is
  // prefix-agnostic and already covered above.
  describe('PWA Skeleton / path prefix /', () => {
    const port = 3215;
    const prefix = '/app';
    const env = { ROOT_URL: `http://localhost:${port}${prefix}` };
    let tempDir;
    let meteorProcess;

    beforeAll(async () => {
      await killProcessByPort(port);
      const result = await createMeteorApp('pwa', 'pwa');
      tempDir = result.tempDir;
      await result.meteorProcess;
      await linkLocalRspack(tempDir);
    }, 360_000);

    afterAll(async () => {
      await cleanupTempDir(tempDir);
    });

    afterEach(async () => {
      await resetPlaywrightPage();
      await killMeteorProcess(meteorProcess);
      meteorProcess = null;
      await killProcessByPort(port);
    });

    test('"meteor run --production" / serves the PWA under the prefix', async () => {
      ({ meteorProcess } = await runMeteorApp(tempDir, port, {
        waitForOutput: '=> App running at',
        // The helper's readiness probe hits `/`, which is a 404 under a prefix.
        skipWaitOn: true,
        commandOptions: ['--production'],
        env,
      }));
      await page.goto(`http://localhost:${port}${prefix}/`);
      await page.waitForSelector('h1');
      await assertPwaInstallable({ port, prefix, swPath: `${prefix}/sw.js` });
      await assertPwaLoadsOffline({ port, meteorProcess });
    });
  });

  describe(
    'React Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'react',
      port: 3205,
      filePaths: {
        client: 'client/main.jsx',
        server: 'server/main.js',
        test: 'tests/main.js',
      },
      bodyStyles: {
        'font-family': process.platform === 'darwin'
          ? 'Inter, -apple-system, "system-ui", "Segoe UI", Roboto, sans-serif'
          : 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '10px',
      },
    }),
  );

  describe(
    'Solid Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'solid',
      port: 3206,
      filePaths: {
        client: 'client/main.js',
        server: 'server/main.js',
        test: 'tests/main.js',
      },
    }),
  );

  describe(
    'Svelte Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'svelte',
      port: 3207,
      filePaths: {
        client: 'client/main.js',
        server: 'server/main.js',
        test: 'tests/main.js',
      },
    }),
  );

  describe(
    'Other / Tailwind Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'tailwind',
      port: 3208,
      filePaths: {
        client: 'client/main.tsx',
        server: 'server/main.ts',
        test: 'tests/main.ts',
      },
      customAssertions: {
        afterRun: async () => {
          // Verify Tailwind styles for '.bg-gray-100' element
          await assertStyles('.bg-gray-100', {
            ['background-color']: 'oklch(0.967 0.003 264.542)',
          });
        },
        afterRunProduction: async () => {
          // Verify Tailwind styles for '.bg-gray-100' element
          await assertStyles('.bg-gray-100', {
            ['background-color']: 'lab(96.1596 -0.0823438 -1.13575)',
          });
        },
      },
    })
  );

  describe(
    'Typescript Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'typescript',
      port: 3209,
      filePaths: {
        client: 'client/main.tsx',
        server: 'server/main.ts',
        test: 'tests/main.ts',
      },
      customAssertions: {
        afterRun: assertTsgoTypeChecker,
      },
    }),
  );

  describe(
    "Typescript Tailwind Skeleton /",
    testMeteorSkeleton({
      skeletonName: "typescript-tailwind",
      port: 3221,
      filePaths: {
        client: "client/main.tsx",
        server: "server/main.ts",
        test: "tests/main.ts",
      },
    })
  );

  describe(
    'Vue Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'vue',
      port: 3210,
      filePaths: {
        client: 'client/main.js',
        server: 'server/main.js',
        test: 'tests/main.js',
      },
    }),
  );
});
