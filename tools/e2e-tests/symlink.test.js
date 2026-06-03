import execa from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { chromium } from 'playwright';
import waitOn from 'wait-on';
import {
  appendFileContent,
  killMeteorProcess,
  killProcessByPort,
  waitForMeteorOutput,
} from './helpers';
import {
  assertFileInTree,
  assertSymlink,
} from './assertions';
import { testMeteorRspackBundler } from './test-helpers';

const APP_PORT = 3152;
const BUNDLE_PORT = 3153;
const DEV_SERVER_PORT = 18152;
const CLIENT_FILE_PATH = 'app/client/main.tsx';
const SERVER_FILE_PATH = 'app/server/main.ts';
const TEST_CLIENT_FILE_PATH = 'app/tests/client.ts';
const TEST_SERVER_FILE_PATH = 'app/tests/server.ts';
const DEV_CLIENT_REBUILD_MESSAGE = 'SYMLINK_E2E_CLIENT_REBUILD_DEV';
const PROD_CLIENT_REBUILD_MESSAGE = 'SYMLINK_E2E_CLIENT_REBUILD_PROD';
const CLIENT_REBUILD_TIMEOUT = process.env.CI ? 300000 : 90000;

const describeSymlinkApp = process.platform === 'win32' ? describe.skip : describe;

const expectedClientPayload = {
  relativeValue: 'client:client-peer-from-symlink-location',
  relativePeer: 'client-peer-from-symlink-location',
  relativeLocation: 'app/client/symlinked/peer.ts',
  sourceDirValue: 'source-dir-through-symlink',
  moduleValue: 'module-through-symlink',
  packageValue: 'meteor-package-through-symlink',
  rootImportValue: 'client-root-import-from-app-root',
};

const expectedServerPayload = {
  relativeValue: 'server:server-peer-from-symlink-location',
  relativePeer: 'server-peer-from-symlink-location',
  relativeLocation: 'app/server/symlinked/peer.ts',
  sourceDirValue: 'source-dir-through-symlink',
  moduleValue: 'module-through-symlink',
  packageValue: 'meteor-package-through-symlink',
  rootImportValue: 'server-root-import-from-app-root',
  privateAsset: 'private asset through symlink',
};

async function assertSymlinkFixtureIntegrity(tempDir) {
  const appDir = path.join(tempDir, 'app');

  await assertSymlink(appDir, 'client/symlinked/shared-file.ts', {
    target: '../../../shared/relative-context/shared-file.ts',
  });
  await assertSymlink(appDir, 'server/symlinked/shared-file.ts', {
    target: '../../../shared/relative-context/shared-file.ts',
  });
  await assertSymlink(appDir, 'imports/symlinked-dir', {
    target: '../../shared/source-dir',
  });
  await assertSymlink(appDir, 'imports/symlinked-module', {
    target: '../../shared/modules/symlinked-module',
  });
  await assertSymlink(appDir, 'packages/symlink-e2e-package', {
    target: '../../shared/meteor-packages/symlink-e2e-package',
  });
  await assertSymlink(appDir, 'public/linked-public', {
    target: '../../shared/public-assets',
  });
  await assertSymlink(appDir, 'private/linked-private', {
    target: '../../shared/private-assets',
  });
  await assertSymlink(appDir, 'tests/client-linked/helper.ts', {
    target: '../../../shared/test-context/helper.ts',
  });
  await assertSymlink(appDir, 'tests/server-linked/helper.ts', {
    target: '../../../shared/test-context/helper.ts',
  });

  expect(await fs.pathExists(path.join(tempDir, 'shared/relative-context/peer.ts'))).toBe(false);
  expect(await fs.pathExists(path.join(tempDir, 'shared/test-context/peer.ts'))).toBe(false);
}

async function assertClientPayload(port, runtimePage) {
  await runtimePage.goto(`http://localhost:${port}`);
  await runtimePage.waitForSelector('[data-testid="symlink-client-payload"]');

  const payload = await runtimePage.evaluate(() => window.__SYMLINK_E2E_CLIENT__);
  expect(payload).toEqual(expectedClientPayload);
}

async function assertPublicAsset(port) {
  const publicResponse = await fetch(`http://localhost:${port}/linked-public/symlink-public.txt`);
  expect(publicResponse.ok).toBe(true);
  const publicAsset = await publicResponse.text();
  expect(publicAsset.trim()).toBe('public asset through symlink');
}

async function assertClientRuntime(port, options = {}) {
  const { tempDir, rebuildMessage } = options;
  let runtimeBrowser;
  let runtimePage;

  try {
    runtimeBrowser = await chromium.launch({ headless: true });
    runtimePage = await runtimeBrowser.newPage();
    await assertClientPayload(port, runtimePage);

    if (tempDir && rebuildMessage) {
      const rebuildConsoleMessage = runtimePage.waitForEvent('console', {
        predicate: message => message.text().includes(rebuildMessage),
        timeout: CLIENT_REBUILD_TIMEOUT,
      });

      await appendFileContent(tempDir, CLIENT_FILE_PATH, {
        content: `console.log("${rebuildMessage}");`,
      });

      expect((await rebuildConsoleMessage).text()).toContain(rebuildMessage);
      await assertClientPayload(port, runtimePage);
    }
  } finally {
    if (runtimePage && !runtimePage.isClosed()) {
      await runtimePage.close();
    }
    if (runtimeBrowser) {
      await runtimeBrowser.close();
    }
  }

  await assertPublicAsset(port);
}

async function assertServerRuntime(port) {
  const response = await fetch(`http://localhost:${port}/__symlink-e2e`);
  expect(response.ok).toBe(true);
  const payload = await response.json();

  expect(payload).toEqual(expectedServerPayload);
}

async function waitForSymlinkTestOutput(outputLines) {
  await waitForMeteorOutput(outputLines, /.*SYMLINK_E2E_TEST_CLIENT_OK.*/);
  await waitForMeteorOutput(outputLines, /.*SYMLINK_E2E_TEST_SERVER_OK.*/);
}

async function runBuiltBundleAssertions(buildOutputDir) {
  let bundleProcess;
  let runtimeBrowser;
  let runtimePage;
  const outputLines = [];
  const bundleDir = path.join(buildOutputDir, 'bundle');

  try {
    await killProcessByPort(BUNDLE_PORT);
    runtimeBrowser = await chromium.launch({ headless: true });
    runtimePage = await runtimeBrowser.newPage();

    bundleProcess = execa('node', ['main.js'], {
      cwd: bundleDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(BUNDLE_PORT),
        ROOT_URL: `http://localhost:${BUNDLE_PORT}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    bundleProcess.stdout.on('data', data => {
      const text = data.toString();
      outputLines.push(...text.split('\n').filter(line => line.trim()));
      process.stdout.write(text);
    });
    bundleProcess.stderr.on('data', data => {
      const text = data.toString();
      outputLines.push(...text.split('\n').filter(line => line.trim()));
      process.stderr.write(text);
    });

    await waitOn({
      resources: [`http-get://localhost:${BUNDLE_PORT}`],
      timeout: process.env.CI ? 300000 : 90000,
    });

    await waitForMeteorOutput(
      outputLines,
      /.*SYMLINK_E2E_SERVER_PAYLOAD.*server-peer-from-symlink-location.*/
    );
    await assertClientPayload(BUNDLE_PORT, runtimePage);
    await assertPublicAsset(BUNDLE_PORT);
    await assertServerRuntime(BUNDLE_PORT);
  } finally {
    if (runtimePage && !runtimePage.isClosed()) {
      await runtimePage.close();
    }
    if (runtimeBrowser) {
      await runtimeBrowser.close();
    }
    if (bundleProcess) {
      await killMeteorProcess(bundleProcess);
    }
    await killProcessByPort(BUNDLE_PORT);
  }
}

describeSymlinkApp('Symlink App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'symlink-monorepo',
    port: APP_PORT,
    devServerPort: DEV_SERVER_PORT,
    isMonorepo: true,
    preserveFixtureSymlinks: true,
    // This suite has a symlink-specific startup failure guard.
    mongoWatchdog: false,
    failOnOutput: /Module not found: Can't resolve.*\.\/peer/,
    // The generic helper client checks use the shared Playwright page. This app
    // keeps its own page open only while asserting symlink runtime behavior.
    skipClient: true,
    filePaths: {
      client: CLIENT_FILE_PATH,
      server: SERVER_FILE_PATH,
      testClient: TEST_CLIENT_FILE_PATH,
      testServer: TEST_SERVER_FILE_PATH,
    },
    checkBundleFilePaths: [
      'programs/web.browser/app/linked-public/symlink-public.txt',
      'programs/web.browser.legacy/app/linked-public/symlink-public.txt',
    ],
    customAssertions: {
      afterCreate: async ({ tempDir }) => {
        await assertSymlinkFixtureIntegrity(tempDir);
      },
      afterInit: async ({ tempDir }) => {
        await assertSymlinkFixtureIntegrity(tempDir);
      },
      afterRun: async ({ tempDir, port, result }) => {
        await assertSymlinkFixtureIntegrity(tempDir);
        await waitForMeteorOutput(
          result.outputLines,
          /.*SYMLINK_E2E_SERVER_PAYLOAD.*server-peer-from-symlink-location.*/
        );
        await assertClientRuntime(port, {
          tempDir,
          rebuildMessage: DEV_CLIENT_REBUILD_MESSAGE,
        });
        await assertServerRuntime(port);
      },
      afterRunRebuildServer: async ({ port }) => {
        await assertServerRuntime(port);
      },
      afterRunProduction: async ({ tempDir, port, result }) => {
        await assertSymlinkFixtureIntegrity(tempDir);
        await waitForMeteorOutput(
          result.outputLines,
          /.*SYMLINK_E2E_SERVER_PAYLOAD.*server-peer-from-symlink-location.*/
        );
        await assertClientRuntime(port, {
          tempDir,
          rebuildMessage: PROD_CLIENT_REBUILD_MESSAGE,
        });
        await assertServerRuntime(port);
      },
      afterRunProductionRebuildServer: async ({ port }) => {
        await assertServerRuntime(port);
      },
      afterTest: async ({ result }) => {
        await waitForSymlinkTestOutput(result.outputLines);
      },
      afterTestOnce: async ({ result }) => {
        await waitForSymlinkTestOutput(result.outputLines);
      },
      afterBuild: async ({ tempDir, buildOutputDir }) => {
        await assertSymlinkFixtureIntegrity(tempDir);
        await assertFileInTree(path.join(buildOutputDir, 'bundle'), 'symlink-private.txt');
        await runBuiltBundleAssertions(buildOutputDir);
      },
      afterReset: async ({ tempDir }) => {
        await assertSymlinkFixtureIntegrity(tempDir);
      },
    },
  }));
});
