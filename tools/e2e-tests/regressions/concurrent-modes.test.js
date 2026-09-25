import fs from 'fs-extra';
import path from 'path';

import { assertMeteorApp } from '../assertions';
import {
  clearBuildArtifacts,
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  killStrayAppProcesses,
  restoreFiles,
  runMeteorApp,
  runMeteorTests,
  snapshotFiles,
  waitForMeteorOutput,
} from '../helpers';
import { setupMeteorRspackApp } from '../test-helpers';

const APP_PORT = 3148;
const APP_RSPACK_PORT = 18148;
const TEST_PORT = 3149;
const TEST_RSPACK_PORT = 18149;
const PRIMARY_LOCAL_DIR = '.meteor/local-primary';
const SECONDARY_LOCAL_DIR = '.meteor/local-secondary';
const LAZY_PACKAGE_NAME = 'e2e-lazy-probe';
const LAZY_PROBE_PATH = '/lazy-package-probe';
const LAZY_PROBE_VALUE = 'lazy package linked';
const SERVER_TEST_NAME = 'runs beside the development server';

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

function getSeparateContextEnv(localDir, rspackPort) {
  return {
    METEOR_LOCAL_DIR: localDir,
    RSPACK_DEVSERVER_PORT: String(rspackPort),
  };
}

async function readBundle(appDir, relativePath) {
  return fs.readFile(path.join(appDir, relativePath), 'utf8');
}

async function waitForOutputToSettle(outputLines, {
  quietMs = 2000,
  timeout = 30000,
} = {}) {
  const startedAt = Date.now();
  let lastLength = outputLines.length;
  let lastChangeAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (outputLines.length !== lastLength) {
      lastLength = outputLines.length;
      lastChangeAt = Date.now();
    } else if (Date.now() - lastChangeAt >= quietMs) {
      return;
    }
  }

  throw new Error('Meteor output did not settle before the watcher probe');
}

// Meteor links a lazy package only when an app module imports it. For Rspack
// server code, main-dev/server-meteor.js carries those imports in its
// lazyExternalImports block, so replacing that file with the placeholder
// breaks the next server start.
async function addLazyPackageServerRoute(appDir) {
  const packageDir = path.join(appDir, 'packages', LAZY_PACKAGE_NAME);
  await fs.outputFile(
    path.join(packageDir, 'package.js'),
    `Package.describe({
  name: '${LAZY_PACKAGE_NAME}',
  version: '0.0.1',
  summary: 'Lazy server package for the concurrent-modes E2E suite',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.mainModule('server.js', 'server', { lazy: true });
});
`,
    'utf8',
  );
  await fs.outputFile(
    path.join(packageDir, 'server.js'),
    `export const lazyProbeValue = '${LAZY_PROBE_VALUE}';\n`,
    'utf8',
  );

  const packagesPath = path.join(appDir, '.meteor', 'packages');
  const packages = await fs.readFile(packagesPath, 'utf8');
  await fs.writeFile(
    packagesPath,
    `${packages.trimEnd()}\n${LAZY_PACKAGE_NAME}\n`,
    'utf8',
  );

  await writeLazyPackageServerRoute(appDir, 0);
}

async function writeLazyPackageServerRoute(appDir, revision) {
  await fs.writeFile(
    path.join(appDir, 'server', 'main.js'),
    `import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { lazyProbeValue } from 'meteor/${LAZY_PACKAGE_NAME}';

const revision = ${revision};

WebApp.handlers.use('${LAZY_PROBE_PATH}', (req, res) => {
  res.end(\`\${lazyProbeValue}:\${revision}\`);
});

Meteor.startup(() => {});
`,
    'utf8',
  );
}

async function fetchLazyPackageRoute(port) {
  const response = await fetch(`http://localhost:${port}${LAZY_PROBE_PATH}`, {
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.text() };
}

async function waitFor(check, description, { timeout = 60000 } = {}) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeout) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`,
  );
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
    const packagesWithoutMongo = packages.replace(
      /^mongo(?:@[^\s]+)?\s*\n/m,
      '',
    );
    // Keep both Meteor processes on one package solution. If the driver is
    // transient, run and test repeatedly rewrite .meteor/versions and obscure
    // the Rspack watcher behavior this suite is meant to exercise.
    await fs.writeFile(
      packagesPath,
      `${packagesWithoutMongo.trimEnd()}\nmeteortesting:mocha\n`,
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
    expect(appProcess.signalCode).toBeNull();
    expect(await readBundle(appDir, developmentBundlePath))
      .toBe(developmentBundle);
    expect(await fs.pathExists(
      path.join(appDir, '_build/app-test/client-rspack.js')
    )).toBe(true);
  });

  test('keeps the development server running through a regular test run', async () => {
    const lazyPackageDir = path.join(appDir, 'packages', LAZY_PACKAGE_NAME);
    const serverTestPath = 'server/concurrent-modes.test.js';
    const snapshot = await snapshotFiles(appDir, [
      '.meteor/packages',
      '.meteor/versions',
      'server/main.js',
      serverTestPath,
    ]);

    try {
      await addLazyPackageServerRoute(appDir);
      // Without testModule, `meteor test` discovers *.test.js files eagerly,
      // as in the reported workflow.
      const packageConfig = structuredClone(basePackageConfig);
      delete packageConfig.meteor.testModule;
      await fs.writeJson(
        path.join(appDir, 'package.json'),
        packageConfig,
        { spaces: 2 },
      );
      await fs.outputFile(
        path.join(appDir, serverTestPath),
        `import assert from 'assert';

describe('concurrent modes', () => {
  it('${SERVER_TEST_NAME}', () => assert.ok(true));
});
`,
        'utf8',
      );

      const appResult = await runMeteorApp(appDir, APP_PORT, {
        waitForOutput: '=> App running at',
        env: getModeEnv(PRIMARY_LOCAL_DIR, APP_RSPACK_PORT),
      });
      appProcess = appResult.meteorProcess;
      expect(await fetchLazyPackageRoute(APP_PORT)).toEqual({
        status: 200,
        body: `${LAZY_PROBE_VALUE}:0`,
      });

      // The reported failure needs a dev server that has rebuilt at least
      // once: only then does its scaffold carry a timestamped build id and
      // stop containing the placeholder verbatim.
      const scaffoldPath = '_build/main-dev/server-meteor.js';
      await writeLazyPackageServerRoute(appDir, 1);
      await waitFor(
        async () => /rspack-server-build-id:\d+/.test(
          await readBundle(appDir, scaffoldPath),
        ),
        'the dev server to bump its server build id',
      );
      await waitFor(
        async () => (await fetchLazyPackageRoute(APP_PORT)).body
          === `${LAZY_PROBE_VALUE}:1`,
        'the rebuilt dev server to serve the edited route',
      );

      const scaffold = await readBundle(appDir, scaffoldPath);
      expect(scaffold).toMatch(/function lazyExternalImports\d+\(\)/);
      expect(scaffold).toContain(`meteor/${LAZY_PACKAGE_NAME}`);

      await waitForOutputToSettle(appResult.outputLines);
      const outputStart = appResult.outputLines.length;

      const testResult = await runMeteorTests(appDir, TEST_PORT, {
        commandOptions: ['--once'],
        checkTestResults: true,
        env: getModeEnv(SECONDARY_LOCAL_DIR, TEST_RSPACK_PORT),
      });
      const testOutput = testResult.outputLines.join('\n');
      expect(testOutput).toContain(SERVER_TEST_NAME);
      expect(testOutput).toMatch(/\b1 passing\b/);

      expect(await readBundle(appDir, scaffoldPath)).toBe(scaffold);

      // A rewritten scaffold makes the dev server restart and crash on its
      // first lazy package import. Let any restart finish before probing.
      await waitForOutputToSettle(appResult.outputLines);
      expect(appResult.outputLines.slice(outputStart).join('\n')).not.toMatch(
        /Your application is crashing|Cannot find package/,
      );
      expect(appProcess.exitCode).toBeNull();
      expect(await fetchLazyPackageRoute(APP_PORT)).toEqual({
        status: 200,
        body: `${LAZY_PROBE_VALUE}:1`,
      });
    } finally {
      await killMeteorProcess(appProcess);
      appProcess = null;
      await restoreFiles(snapshot);
      await fs.remove(lazyPackageDir);
    }
  });

  test('ignores new output directories in another Rspack context', async () => {
    const appResult = await runMeteorApp(appDir, APP_PORT, {
      waitForOutput: '=> App running at',
      env: getSeparateContextEnv(PRIMARY_LOCAL_DIR, APP_RSPACK_PORT),
    });
    appProcess = appResult.meteorProcess;

    const testResult = await runMeteorTests(appDir, TEST_PORT, {
      waitForOutput: '=> App running at',
      commandOptions: ['--full-app'],
      testClient: true,
      env: getSeparateContextEnv(SECONDARY_LOCAL_DIR, TEST_RSPACK_PORT),
    });
    testProcess = testResult.meteorProcess;

    const otherProcessBundle = path.join(
      appDir,
      '_build-local-secondary/app-test/client-rspack.js',
    );
    expect(await fs.pathExists(otherProcessBundle)).toBe(true);

    // Startup metadata and discovery of a new root directory can legitimately
    // restart the app. Once both processes settle, create a new output
    // directory inside the other process's context. Without directory-level
    // isolation, Meteor descends into that context and rebuilds.
    await waitForOutputToSettle(appResult.outputLines);
    const outputStart = appResult.outputLines.length;
    const newProcessBundle = path.join(
      appDir,
      '_build-local-secondary/watcher-probe/client-rspack.js',
    );
    await fs.outputFile(
      newProcessBundle,
      '// cross-process watcher probe\n',
      'utf8',
    );
    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(appResult.outputLines.slice(outputStart).join('\n')).not.toMatch(
      /=> (?:Client|Server) modified/,
    );
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
