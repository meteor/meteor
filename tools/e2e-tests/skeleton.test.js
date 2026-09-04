/**
 * This file contains tests for different Meteor skeletons.
 * It uses the testMeteorSkeleton function to test the creation, running, testing, and building
 * of different Meteor skeletons (apollo, react, etc.).
 */

import { assertStyles, getPlaywrightPage } from './assertions';
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
import waitOn from 'wait-on';

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

  // A path-prefixed ROOT_URL (https://example.com/app) serves everything under
  // the prefix, so the boilerplate has to inject every script with it, the
  // Rspack dev client script included (#14716). The counter helper lives in
  // client/main.js: "0 times" only renders if the app's client code ran.
  describe('Blaze Skeleton / path prefix /', () => {
    const port = 3216;
    const prefix = '/app';
    const url = `http://localhost:${port}${prefix}/`;
    let tempDir;
    let meteorProcess;

    async function runUnderPrefix(commandOptions = []) {
      ({ meteorProcess } = await runMeteorApp(tempDir, port, {
        waitForOutput: '=> App running at',
        commandOptions,
        env: { ROOT_URL: `http://localhost:${port}${prefix}` },
        // The helper's readiness probe hits `/`, a 404 under a prefix.
        skipWaitOn: true,
      }));
      await waitOn({
        resources: [`http-get://localhost:${port}${prefix}/`],
        timeout: process.env.CI ? 300_000 : 90_000,
      });
    }

    // getPlaywrightPage recovers a page if the browser went down between tests.
    async function openApp() {
      const activePage = await getPlaywrightPage();
      await activePage.goto(url);
      return activePage;
    }

    async function assertClientCodeRuns(activePage) {
      await activePage.waitForSelector('h1');
      await activePage.waitForFunction(
        () => document.querySelector('p')?.textContent.includes('pressed the button 0 times'),
        null,
        { timeout: 15_000 },
      );
      console.log(`✅ Client code running under the prefix (${url})`);
    }

    beforeAll(async () => {
      const result = await createMeteorApp('blaze', 'blaze');
      tempDir = result.tempDir;
      await result.meteorProcess;
      await linkLocalRspack(tempDir);
    }, 360_000);

    afterAll(async () => {
      await cleanupTempDir(tempDir);
    });

    beforeEach(async () => {
      await killProcessByPort(port);
    });

    afterEach(async () => {
      await resetPlaywrightPage();
      await killMeteorProcess(meteorProcess);
      meteorProcess = null;
    });

    test('"meteor run" / injects the Rspack dev script under the prefix', async () => {
      await runUnderPrefix();
      const activePage = await openApp();
      const src = await activePage.$eval('script[src*="__rspack__"]', (s) => s.getAttribute('src'));
      expect(src.startsWith(`${prefix}/__rspack__/`)).toBe(true);
      await assertClientCodeRuns(activePage);
    });

    test('"meteor run --production" / serves the app under the prefix', async () => {
      await runUnderPrefix(['--production']);
      await assertClientCodeRuns(await openApp());
    });
  });

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
