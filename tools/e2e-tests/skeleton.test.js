/**
 * This file contains tests for different Meteor skeletons.
 * It uses the testMeteorSkeleton function to test the creation, running, testing, and building
 * of different Meteor skeletons (apollo, react, etc.).
 */

import { assertStyles } from './assertions';
import { waitForMeteorOutput } from './helpers';
import { testMeteorSkeleton } from './test-helpers';
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

async function assertReact19Dependencies({ tempDir }, includeTypes = false) {
  const packageJsonPath = path.join(tempDir, 'package.json');
  const packageJson = JSON.parse(
    await fs.promises.readFile(packageJsonPath, 'utf8')
  );

  expect(packageJson.dependencies.react).toBe('^19.2.0');
  expect(packageJson.dependencies['react-dom']).toBe('^19.2.0');

  if (includeTypes) {
    expect(packageJson.devDependencies['@types/react']).toBe('^19.2.0');
    expect(packageJson.devDependencies['@types/react-dom']).toBe('^19.2.0');
  }
}

async function assertPnpmBrowser() {
  const statusText = await page.$eval(
    '#workspace-status',
    (element) => element.textContent
  );
  expect(statusText).toContain('@example/ui');
  expect(statusText).toContain('client package compiled by Rspack');

  const accentText = await page.$eval(
    '#accent-color',
    (element) => element.textContent
  );
  expect(accentText).toContain('#40E0D0');
}

async function assertPnpmRuntime({ result }) {
  await waitForMeteorOutput(
    result.outputLines,
    /domain:server:pnpm workspace package loaded on the server/,
  );
  await waitForMeteorOutput(result.outputLines, /@example\/server:compiled/);
  await waitForMeteorOutput(result.outputLines, /domain:server:accent #40E0D0/);
  await assertPnpmBrowser();
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
      customAssertions: {
        afterCreate: assertReact19Dependencies,
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
      customAssertions: {
        afterCreate: assertReact19Dependencies,
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
      customAssertions: {
        afterCreate: assertReact19Dependencies,
      },
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
      customAssertions: {
        afterCreate: assertReact19Dependencies,
      },
    }),
  );

  describe(
    'Full Skeleton /',
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
    'Pnpm Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'pnpm',
      port: 3222,
      meteorAppPath: 'apps/app',
      packageManager: 'pnpm',
      filePaths: {
        client: 'client/main.js',
        server: 'server/main.js',
        test: 'tests/main.test.js',
      },
      customAssertions: {
        async afterCreate({ tempDir, appDir }) {
          expect(
            await fs.pathExists(path.join(tempDir, 'pnpm-workspace.yaml'))
          ).toBe(true);
          expect(
            await fs.pathExists(path.join(tempDir, 'pnpm-lock.yaml'))
          ).toBe(true);
          expect(
            await fs.pathExists(path.join(appDir, '.meteor', 'release'))
          ).toBe(true);
          expect(
            await fs.pathExists(
              path.join(appDir, 'node_modules', '@example', 'shared')
            )
          ).toBe(true);

          const workspaceName = path.basename(tempDir);
          const rootPackageJson = await fs.readJson(
            path.join(tempDir, 'package.json')
          );
          const appPackageJson = await fs.readJson(
            path.join(appDir, 'package.json')
          );
          expect(rootPackageJson.name).toBe(workspaceName);
          expect(appPackageJson.name).toBe(`${workspaceName}-app`);
          expect(appPackageJson.meteor.autoInstallDeps).toBe(false);
          expect(appPackageJson.dependencies['@example/shared']).toBe(
            'workspace:*'
          );
        },
        afterRun: assertPnpmRuntime,
        afterRunProduction: assertPnpmRuntime,
        afterRunBuiltApp: assertPnpmBrowser,
        async afterTestOnce({ result }) {
          await waitForMeteorOutput(
            result.outputLines,
            /pnpm workspace packages compiled/,
          );
          await waitForMeteorOutput(
            result.outputLines,
            /pnpm transitive dependencies resolved/,
          );
        },
        async afterReset({ tempDir }) {
          expect(
            await fs.pathExists(path.join(tempDir, 'node_modules'))
          ).toBe(true);
          expect(
            await fs.pathExists(path.join(tempDir, 'pnpm-lock.yaml'))
          ).toBe(true);
        },
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
      customAssertions: {
        afterCreate: assertReact19Dependencies,
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
    'Tailwind Skeleton /',
    testMeteorSkeleton({
      skeletonName: 'tailwind',
      port: 3208,
      filePaths: {
        client: 'client/main.tsx',
        server: 'server/main.ts',
        test: 'tests/main.ts',
      },
      customAssertions: {
        afterCreate: assertReact19Dependencies,
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
        async afterCreate({ tempDir }) {
          await assertReact19Dependencies({ tempDir }, true);
        },
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
      customAssertions: {
        async afterCreate({ tempDir }) {
          await assertReact19Dependencies({ tempDir }, true);
        },
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
