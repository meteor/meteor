import fs from 'fs-extra';
import path from 'path';

import { assertMeteorApp } from '../assertions';
import {
  clearBuildArtifacts,
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  killStrayAppProcesses,
  runMeteorApp,
  runMeteorTests,
  waitForMeteorOutput,
} from '../helpers';
import { setupMeteorRspackApp } from '../test-helpers';

const APP_PORT = 3148;
const APP_RSPACK_PORT = 18148;
const TEST_PORT = 3149;
const TEST_RSPACK_PORT = 18149;
const PRIMARY_LOCAL_DIR = '.meteor/local-primary';
const SECONDARY_LOCAL_DIR = '.meteor/local-secondary';

function getModeEnv(localDir, rspackPort) {
  return {
    METEOR_LOCAL_DIR: localDir,
    // Keep Meteor's local caches isolated while both processes target the
    // same Rspack contexts. This reproduces the artifact cleanup collision.
    RSPACK_BUILD_CONTEXT: '_build',
    RSPACK_ASSETS_CONTEXT: 'build-assets',
    RSPACK_CHUNKS_CONTEXT: 'build-chunks',
    RSPACK_DEVSERVER_PORT: String(rspackPort),
  };
}

async function readBundle(appDir, relativePath) {
  return fs.readFile(path.join(appDir, relativePath), 'utf8');
}

describe('Regressions / Rspack concurrent modes /', () => {
  let tempDir;
  let appDir;
  let appProcess;
  let testProcess;
  let basePackageConfig;

  beforeAll(async () => {
    ({ tempDir, appDir } = await setupMeteorRspackApp({
      appName: 'blaze-router',
    }));

    const packagesPath = path.join(appDir, '.meteor', 'packages');
    const packages = await fs.readFile(packagesPath, 'utf8');
    await fs.writeFile(
      packagesPath,
      packages.replace(/^mongo(?:@[^\s]+)?\s*\n/m, ''),
      'utf8',
    );
    basePackageConfig = await fs.readJson(path.join(appDir, 'package.json'));
  }, 600_000);

  beforeEach(async () => {
    await killProcessByPort([
      APP_PORT,
      APP_RSPACK_PORT,
      TEST_PORT,
      TEST_RSPACK_PORT,
    ]);
    await clearBuildArtifacts(appDir);
    await fs.remove(path.join(appDir, PRIMARY_LOCAL_DIR));
    await fs.remove(path.join(appDir, SECONDARY_LOCAL_DIR));
    await fs.writeJson(
      path.join(appDir, 'package.json'),
      basePackageConfig,
      { spaces: 2 },
    );
  });

  afterEach(async () => {
    await killMeteorProcess(testProcess);
    await killMeteorProcess(appProcess);
    await killStrayAppProcesses();
    testProcess = null;
    appProcess = null;
    await killProcessByPort([
      APP_PORT,
      APP_RSPACK_PORT,
      TEST_PORT,
      TEST_RSPACK_PORT,
    ]);
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  test('keeps development and full-app test builds running together', async () => {
    const appResult = await runMeteorApp(appDir, APP_PORT, {
      waitForOutput: '=> App running at',
      env: getModeEnv(PRIMARY_LOCAL_DIR, APP_RSPACK_PORT),
    });
    appProcess = appResult.meteorProcess;
    await assertMeteorApp(APP_PORT, {
      title: 'blaze-router',
      h1: 'Welcome to Meteor!',
    });

    const developmentBundlePath = '_build/main-dev/server-rspack.cjs';
    const developmentBundle = await readBundle(appDir, developmentBundlePath);

    const testResult = await runMeteorTests(appDir, TEST_PORT, {
      waitForOutput: '=> App running at',
      commandOptions: ['--full-app'],
      testClient: true,
      env: getModeEnv(SECONDARY_LOCAL_DIR, TEST_RSPACK_PORT),
    });
    testProcess = testResult.meteorProcess;

    expect(appProcess.exitCode).toBeNull();
    expect(await readBundle(appDir, developmentBundlePath))
      .toBe(developmentBundle);
    expect(await fs.pathExists(
      path.join(appDir, '_build/app-test/client-rspack.js')
    )).toBe(true);
  });

  test('isolates normal-test and full-app-test module directories', async () => {
    const normalTestResult = await runMeteorTests(appDir, APP_PORT, {
      waitForOutput: '=> App running at',
      testClient: true,
      env: getModeEnv(PRIMARY_LOCAL_DIR, APP_RSPACK_PORT),
    });
    appProcess = normalTestResult.meteorProcess;

    const normalBundlePath = '_build/test/client-rspack.js';
    const normalBundle = await readBundle(appDir, normalBundlePath);

    const fullAppResult = await runMeteorTests(appDir, TEST_PORT, {
      waitForOutput: '=> App running at',
      commandOptions: ['--full-app'],
      testClient: true,
      env: getModeEnv(SECONDARY_LOCAL_DIR, TEST_RSPACK_PORT),
    });
    testProcess = fullAppResult.meteorProcess;

    const fullAppBundlePath = '_build/app-test/client-rspack.js';
    const fullAppBundle = await readBundle(appDir, fullAppBundlePath);

    expect(await readBundle(appDir, normalBundlePath)).toBe(normalBundle);
    expect(fullAppBundle).toContain('__CLIENT_BOOTED__');

    await killMeteorProcess(testProcess);
    await killMeteorProcess(appProcess);
    testProcess = null;
    appProcess = null;
    await killProcessByPort([
      APP_PORT,
      APP_RSPACK_PORT,
      TEST_PORT,
      TEST_RSPACK_PORT,
    ]);

    const restartedFullAppResult = await runMeteorTests(appDir, APP_PORT, {
      waitForOutput: '=> App running at',
      commandOptions: ['--full-app'],
      testClient: true,
      env: getModeEnv(PRIMARY_LOCAL_DIR, APP_RSPACK_PORT),
    });
    appProcess = restartedFullAppResult.meteorProcess;
    const restartedFullAppBundle = await readBundle(appDir, fullAppBundlePath);

    const restartedNormalTestResult = await runMeteorTests(appDir, TEST_PORT, {
      waitForOutput: '=> App running at',
      testClient: true,
      env: getModeEnv(SECONDARY_LOCAL_DIR, TEST_RSPACK_PORT),
    });
    testProcess = restartedNormalTestResult.meteorProcess;

    expect(await readBundle(appDir, fullAppBundlePath))
      .toBe(restartedFullAppBundle);
  });

  test.each([
    ['without testModule', undefined],
    [
      'with a server-only testModule',
      { server: 'tests/server/main.js' },
    ],
  ])('builds the app client for full-app tests %s', async (_name, testModule) => {
    const packageConfig = structuredClone(basePackageConfig);
    if (testModule) {
      packageConfig.meteor.testModule = testModule;
    } else {
      delete packageConfig.meteor.testModule;
    }
    await fs.writeJson(
      path.join(appDir, 'package.json'),
      packageConfig,
      { spaces: 2 },
    );

    const result = await runMeteorTests(appDir, APP_PORT, {
      waitForOutput: '=> App running at',
      commandOptions: ['--full-app'],
      testClient: true,
      env: getModeEnv(PRIMARY_LOCAL_DIR, APP_RSPACK_PORT),
    });
    appProcess = result.meteorProcess;

    await waitForMeteorOutput(
      result.outputLines,
      /.*loads the Rspack client bundle.*/,
    );
    expect(await readBundle(
      appDir,
      '_build/app-test/client-rspack.js',
    )).toContain('__CLIENT_BOOTED__');
  });
});
