import fs from 'fs-extra';
import path from 'path';

import {
  appendFileContent,
  buildMeteorApp,
  cleanupTempDir,
  killMeteorProcess,
  killProcessByPort,
  killStrayAppProcesses,
  restoreFiles,
  runMeteorApp,
  runMeteorCommand,
  setupMeteorApp,
  snapshotFiles,
  wait,
  waitForMeteorOutput,
  waitForPlaywrightConsole,
} from './helpers';
import {
  assertFileExist,
  assertPathNotExist,
} from './assertions';

const { linkLocalRspack } = require('./scripts/link-rspack');
const { linkLocalCapacitor } = require('./scripts/link-capacitor');

const APP_NAME = 'native-react';
const PORT = 3134;
const RSPACK_DEVSERVER_PORT = 18134;
const MUTATED_FILES = [
  'imports/ui/App.jsx',
  'server/main.js',
];
const CLIENT_REBUILD_MESSAGE = 'capacitor e2e client rebuild';
const SERVER_REBUILD_MESSAGE = 'capacitor e2e server rebuild';
const PROD_CLIENT_REBUILD_MESSAGE = 'capacitor e2e production client rebuild';
const PROD_SERVER_REBUILD_MESSAGE = 'capacitor e2e production server rebuild';

function e2eEnv(extra = {}) {
  return {
    CAPACITOR_BUILD_CONTEXT: '_build',
    METEOR_CAPACITOR_LOCAL_IP: '127.0.0.1',
    PORT: String(PORT),
    RSPACK_DEVSERVER_PORT: String(RSPACK_DEVSERVER_PORT),
    ...extra,
  };
}

function outputText(outputLines = []) {
  return outputLines.join('\n');
}

function expectOutputContains(outputLines, pattern) {
  expect(outputText(outputLines)).toMatch(pattern);
}

function expectOutputNotContains(outputLines, pattern) {
  expect(outputText(outputLines)).not.toMatch(pattern);
}

async function readJson(appDir, relPath) {
  return fs.readJson(path.join(appDir, relPath));
}

async function assertRspackDevelopmentArtifacts(appDir) {
  await assertFileExist(appDir, '_build/main-dev/client-entry.js');
  await assertFileExist(appDir, '_build/main-dev/client-rspack.js');
  await assertFileExist(appDir, '_build/main-dev/client-meteor.js');
  await assertFileExist(appDir, '_build/main-dev/server-entry.js');
  await assertFileExist(appDir, '_build/main-dev/server-rspack.js');
  await assertFileExist(appDir, '_build/main-dev/server-meteor.js');
  await assertPathNotExist(appDir, '.meteor/local/build/programs/server/npm/node_modules/.cache');
}

async function assertRspackProductionArtifacts(appDir) {
  await assertFileExist(appDir, '_build/main-prod/client-entry.js');
  await assertFileExist(appDir, '_build/main-prod/client-rspack.js');
  await assertFileExist(appDir, '_build/main-prod/client-meteor.js');
  await assertFileExist(appDir, '_build/main-prod/server-entry.js');
  await assertFileExist(appDir, '_build/main-prod/server-rspack.js');
  await assertFileExist(appDir, '_build/main-prod/server-meteor.js');
  await assertFileExist(appDir, '_build/main-prod/index.html');
}

async function assertNoNativeLaunch(outputLines) {
  expectOutputNotContains(outputLines, /Capacitor launching on/);
  expectOutputNotContains(outputLines, /emulator/i);
  expectOutputNotContains(outputLines, /simulator/i);
  expectOutputNotContains(outputLines, /Android Studio/i);
  expectOutputNotContains(outputLines, /Xcode/i);
}

async function assertNoCordovaNativeBuild(outputLines) {
  expectOutputNotContains(outputLines, /preparing Cordova project/i);
  expectOutputNotContains(outputLines, /building Cordova app/i);
  expectOutputNotContains(outputLines, /Creating a new cordova project/i);
  expectOutputNotContains(outputLines, /Gradle/i);
}

async function assertCapacitorSyncedNativeAssets(appDir, platform) {
  if (platform === 'android') {
    await assertFileExist(appDir, 'android/app/src/main/assets/public/index.html', { content: 'var WebAppLocalServer' });
    await assertFileExist(appDir, 'android/app/src/main/assets/capacitor.config.json');
    return;
  }

  await assertFileExist(appDir, 'ios/App/App/public/index.html', { content: 'var WebAppLocalServer' });
  await assertFileExist(appDir, 'ios/App/App/capacitor.config.json');
}

async function assertCapacitorWebDir(appDir, mode, platform = 'android', options = {}) {
  const webDir = mode === 'prod' ? '_build/native-prod' : '_build/native-dev';
  const {
    cordovaProgramPath = '.meteor/local/build/programs/web.cordova/program.json',
  } = options;

  if (cordovaProgramPath) {
    await assertFileExist(appDir, cordovaProgramPath);
  }
  await assertFileExist(appDir, `${webDir}/index.html`);
  await assertFileExist(appDir, `${webDir}/capacitor.config.json`);
  await assertPathNotExist(appDir, `${webDir}/program.json`);
  await assertPathNotExist(appDir, `${webDir}/body.html`);
  await assertPathNotExist(appDir, `${webDir}/head.html`);
  await assertFileExist(appDir, `${webDir}/index.html`, { content: 'var WebAppLocalServer' });
  await assertFileExist(appDir, `${webDir}/index.html`, { content: '__meteor_runtime_config__' });

  const indexHtml = await fs.readFile(path.join(appDir, webDir, 'index.html'), 'utf8');
  expect(indexHtml).not.toContain('__cordova/');

  await assertCapacitorSyncedNativeAssets(appDir, platform);

  return readJson(appDir, `${webDir}/capacitor.config.json`);
}

function assertCapacitorConfig(config, mode, platform = 'android') {
  const webDir = mode === 'prod' ? '_build/native-prod' : '_build/native-dev';

  expect(config.webDir).toBe(webDir);
  expect(config.bundledWebRuntime).toBe(false);
  expect(config.plugins.MeteorE2E.platform).toBe(platform);
  expect(config.plugins.MeteorE2E.isRun).toBe(true);
  expect(config.plugins.MeteorE2E.isNativeAndroid).toBe(platform === 'android');
  expect(config.plugins.MeteorE2E.isNativeIos).toBe(platform === 'ios');
  expect(config.plugins.MeteorE2E.webDir).toBe(webDir);
  expect(config.plugins.MeteorE2E.mode).toBe(mode === 'prod' ? 'bundled' : 'development');
  expect(config.plugins.MeteorE2E.localIp).toBe('127.0.0.1');
  expect(config.plugins.MeteorE2E.port).toBe(String(PORT));

  if (mode === 'prod') {
    expect(config.server).toBeUndefined();
  } else {
    expect(config.server.url).toBe(`http://127.0.0.1:${PORT}`);
  }
}

async function assertNativeReactApp(port) {
  const consoleErrors = [];
  const pageErrors = [];
  const consoleListener = msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  };
  const pageErrorListener = err => {
    const message = err?.message || String(err);
    if (!/_jp\.[a-z0-9]+ is not a function/.test(message)) {
      pageErrors.push(message);
    }
  };

  page.on('console', consoleListener);
  page.on('pageerror', pageErrorListener);
  try {
    await page.goto(`http://localhost:${port}`);
    await page.waitForSelector('[data-testid="native-react-root"]');

    const title = await page.title();
    expect(title).toBe(APP_NAME);

    const heading = await page.$eval('h1', el => el.textContent);
    expect(heading).toBe('Welcome to Meteor Native React');

    const context = await page.$eval('[data-testid="native-context"]', el => el.textContent);
    expect(context).toBe('Rspack and Capacitor fixture');

    expect([...consoleErrors, ...pageErrors]).toEqual([]);
  } finally {
    try {
      page.removeListener('console', consoleListener);
      page.removeListener('pageerror', pageErrorListener);
    } catch (err) {
    }
  }
}

describe('Capacitor App Web Lifecycle /', () => {
  let tempDir;
  let meteorProcess;
  let addPlatformOutput = [];
  let fileSnapshot;

  beforeAll(async () => {
    await killProcessByPort([PORT, RSPACK_DEVSERVER_PORT]);

    tempDir = (await setupMeteorApp(APP_NAME))?.tempDir;

    await linkLocalRspack(tempDir);
    await linkLocalCapacitor(tempDir);

    const result = await runMeteorCommand('add-platform', ['android'], tempDir, {
      captureOutput: true,
      checkExitCode: true,
      env: e2eEnv(),
    });
    addPlatformOutput = result.outputLines;
  });

  beforeEach(async () => {
    if (globalThis.page && !globalThis.page.isClosed?.()) {
      globalThis.page.removeAllListeners('pageerror');
    }
    await killProcessByPort([PORT, RSPACK_DEVSERVER_PORT]);
    fileSnapshot = tempDir ? await snapshotFiles(tempDir, MUTATED_FILES) : null;
  });

  afterEach(async () => {
    if (meteorProcess) {
      await killMeteorProcess(meteorProcess);
      meteorProcess = null;
    }
    await killStrayAppProcesses();

    if (fileSnapshot) {
      await restoreFiles(fileSnapshot);
      fileSnapshot = null;
    }
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  test('"meteor add-platform android" installs deps and creates native context', async () => {
    expectOutputContains(addPlatformOutput, /Capacitor Dependencies/);
    expectOutputContains(addPlatformOutput, /Installed Capacitor dependencies/);
    expectOutputContains(addPlatformOutput, /Capacitor add android|android: added platform/);

    const packageJson = await readJson(tempDir, 'package.json');
    expect(packageJson.dependencies).toHaveProperty('@capacitor/core');
    expect(packageJson.dependencies).toHaveProperty('@capacitor/android');
    expect(packageJson.devDependencies).toHaveProperty('@capacitor/cli');
    expect(packageJson.devDependencies).toHaveProperty('@meteorjs/capacitor');

    await assertFileExist(tempDir, 'node_modules/@capacitor/core/package.json');
    await assertFileExist(tempDir, 'node_modules/@capacitor/android/package.json');
    await assertFileExist(tempDir, 'node_modules/@capacitor/cli/package.json');
    await assertFileExist(tempDir, 'node_modules/@meteorjs/capacitor/package.json');
    await assertFileExist(tempDir, 'node_modules/@meteorjs/rspack/package.json');
    await assertFileExist(tempDir, '.meteor/platforms', { content: 'android' });
    await assertFileExist(tempDir, 'android');
    await assertFileExist(tempDir, '.gitignore', { content: '_build' });
    await assertFileExist(tempDir, '.gitignore', { content: 'android/app/src/main/assets/public' });
    await assertFileExist(tempDir, '.gitignore', { content: 'android/app/src/main/assets/capacitor.*.json' });
  });

  test('"meteor add-platform ios" installs deps and creates native context', async () => {
    const result = await runMeteorCommand('add-platform', ['ios'], tempDir, {
      captureOutput: true,
      checkExitCode: true,
      env: e2eEnv(),
    });

    expectOutputContains(result.outputLines, /Capacitor Dependencies/);
    expectOutputContains(result.outputLines, /Installed Capacitor dependencies/);
    expectOutputContains(result.outputLines, /Capacitor add ios|ios: added platform/);

    const packageJson = await readJson(tempDir, 'package.json');
    expect(packageJson.dependencies).toHaveProperty('@capacitor/core');
    expect(packageJson.dependencies).toHaveProperty('@capacitor/ios');
    expect(packageJson.devDependencies).toHaveProperty('@capacitor/cli');
    expect(packageJson.devDependencies).toHaveProperty('@meteorjs/capacitor');

    await assertFileExist(tempDir, 'node_modules/@capacitor/core/package.json');
    await assertFileExist(tempDir, 'node_modules/@capacitor/ios/package.json');
    await assertFileExist(tempDir, 'node_modules/@capacitor/cli/package.json');
    await assertFileExist(tempDir, 'node_modules/@meteorjs/capacitor/package.json');
    await assertFileExist(tempDir, '.meteor/platforms', { content: 'ios' });
    await assertFileExist(tempDir, 'ios/App/App.xcworkspace');
    await assertFileExist(tempDir, '.gitignore', { content: '_build' });
    await assertFileExist(tempDir, '.gitignore', { content: 'ios/App/App/public' });
    await assertFileExist(tempDir, '.gitignore', { content: 'ios/App/App/capacitor.*.json' });
    await assertFileExist(tempDir, '.gitignore', { content: 'ios/App/App/config.xml' });
  });

  test('"meteor run android" serves web app and prepares Capacitor webDir', async () => {
    const result = await runMeteorApp(tempDir, PORT, {
      waitForOutput: /Capacitor native run skipped/,
      commandOptions: ['android'],
      env: e2eEnv({
        METEOR_CAPACITOR_SKIP_NATIVE_RUN: '1',
        METEOR_CAPACITOR_READY_URL: `http://127.0.0.1:${PORT}/`,
      }),
    });
    meteorProcess = result.meteorProcess;

    await assertNativeReactApp(PORT);
    await assertRspackDevelopmentArtifacts(tempDir);
    expectOutputContains(result.outputLines, /Rspack Build Client|Used .*Rspack/);
    await wait(1000);
    await assertNativeReactApp(PORT);

    const config = await assertCapacitorWebDir(tempDir, 'dev');
    assertCapacitorConfig(config, 'dev');

    await waitForMeteorOutput(result.outputLines, /Capacitor native run skipped by METEOR_CAPACITOR_SKIP_NATIVE_RUN/);
    await assertNoNativeLaunch(result.outputLines);

    const clientRebuild = waitForPlaywrightConsole(CLIENT_REBUILD_MESSAGE, { returnAllLogs: true });
    await appendFileContent(tempDir, 'imports/ui/App.jsx', {
      content: `console.log("${CLIENT_REBUILD_MESSAGE}");`,
    });
    await clientRebuild;
    await assertNativeReactApp(PORT);
    await assertFileExist(tempDir, '_build/main-dev/client-rspack.js');
    await assertFileExist(tempDir, '_build/native-dev/index.html', { content: 'var WebAppLocalServer' });

    await appendFileContent(tempDir, 'server/main.js', {
      content: `Meteor.startup(() => console.log("${SERVER_REBUILD_MESSAGE}"));`,
    });
    await waitForMeteorOutput(result.outputLines, SERVER_REBUILD_MESSAGE);
    await assertFileExist(tempDir, '_build/main-dev/server-rspack.js');

    expect(meteorProcess.exitCode).toBe(null);
    expect(meteorProcess.signalCode).toBe(null);
  });

  test('"meteor run android --production" serves production web app and prepares Capacitor webDir', async () => {
    const result = await runMeteorApp(tempDir, PORT, {
      waitForOutput: /Capacitor native run skipped/,
      commandOptions: ['android', '--production'],
      env: e2eEnv({
        METEOR_CAPACITOR_SKIP_NATIVE_RUN: '1',
        METEOR_CAPACITOR_READY_URL: `http://127.0.0.1:${PORT}/`,
      }),
    });
    meteorProcess = result.meteorProcess;

    await assertNativeReactApp(PORT);
    await assertRspackProductionArtifacts(tempDir);
    await wait(1000);

    const config = await assertCapacitorWebDir(tempDir, 'prod');
    assertCapacitorConfig(config, 'prod');

    await waitForMeteorOutput(result.outputLines, /Capacitor native run skipped by METEOR_CAPACITOR_SKIP_NATIVE_RUN/);
    await assertNoNativeLaunch(result.outputLines);

    const clientRebuild = waitForPlaywrightConsole(PROD_CLIENT_REBUILD_MESSAGE, { returnAllLogs: true });
    await appendFileContent(tempDir, 'imports/ui/App.jsx', {
      content: `console.log("${PROD_CLIENT_REBUILD_MESSAGE}");`,
    });
    await clientRebuild;
    await assertNativeReactApp(PORT);
    await assertFileExist(tempDir, '_build/main-prod/client-rspack.js');

    await appendFileContent(tempDir, 'server/main.js', {
      content: `Meteor.startup(() => console.log("${PROD_SERVER_REBUILD_MESSAGE}"));`,
    });
    await waitForMeteorOutput(result.outputLines, PROD_SERVER_REBUILD_MESSAGE);
    await assertFileExist(tempDir, '_build/main-prod/server-rspack.js');

    expect(meteorProcess.exitCode).toBe(null);
    expect(meteorProcess.signalCode).toBe(null);
  });

  test('"meteor build --directory --platforms=android" builds Capacitor web output without running native tools', async () => {
    let buildOutputDir;

    try {
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--platforms=android', '--server=http://127.0.0.1:3000'],
        captureOutput: true,
        env: e2eEnv(),
      });
      buildOutputDir = result.buildOutputDir;

      await assertFileExist(buildOutputDir, 'bundle/main.js');
      await assertFileExist(buildOutputDir, 'bundle/programs/web.cordova/program.json');
      await assertFileExist(tempDir, '_build/main-prod/server-rspack.js');

      const config = await assertCapacitorWebDir(tempDir, 'prod', 'android', {
        cordovaProgramPath: null,
      });
      expect(config.plugins.MeteorE2E.isBuild).toBe(true);
      expect(config.plugins.MeteorE2E.isRun).toBe(false);
      expect(config.plugins.MeteorE2E.platform).toBe('android');
      expect(config.server).toBeUndefined();
      await assertNoNativeLaunch(result.processResult.outputLines);
      await assertNoCordovaNativeBuild(result.processResult.outputLines);
    } finally {
      await cleanupTempDir(buildOutputDir);
    }
  });

  test('"meteor build --directory --platforms=ios" builds Capacitor web output without running native tools', async () => {
    let buildOutputDir;

    try {
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--platforms=ios', '--server=http://127.0.0.1:3000'],
        captureOutput: true,
        env: e2eEnv(),
      });
      buildOutputDir = result.buildOutputDir;

      await assertFileExist(buildOutputDir, 'bundle/main.js');
      await assertFileExist(buildOutputDir, 'bundle/programs/web.cordova/program.json');
      await assertFileExist(tempDir, '_build/main-prod/server-rspack.js');

      const config = await assertCapacitorWebDir(tempDir, 'prod', 'ios', {
        cordovaProgramPath: null,
      });
      expect(config.plugins.MeteorE2E.isBuild).toBe(true);
      expect(config.plugins.MeteorE2E.isRun).toBe(false);
      expect(config.plugins.MeteorE2E.platform).toBe('ios');
      expect(config.plugins.MeteorE2E.isNativeIos).toBe(true);
      expect(config.plugins.MeteorE2E.isNativeAndroid).toBe(false);
      expect(config.server).toBeUndefined();
      await assertNoNativeLaunch(result.processResult.outputLines);
      await assertNoCordovaNativeBuild(result.processResult.outputLines);
    } finally {
      await cleanupTempDir(buildOutputDir);
    }
  });

  test('"meteor build --directory --platforms=android" rebuilds Capacitor web output without stale local web.cordova', async () => {
    let buildOutputDir;

    await fs.remove(path.join(tempDir, '.meteor/local/build/programs/web.cordova'));
    await fs.remove(path.join(tempDir, '_build/native-prod'));

    try {
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--platforms=android', '--server=http://127.0.0.1:3000'],
        captureOutput: true,
        env: e2eEnv(),
      });
      buildOutputDir = result.buildOutputDir;

      await assertFileExist(buildOutputDir, 'bundle/programs/web.cordova/program.json');
      const config = await assertCapacitorWebDir(tempDir, 'prod', 'android', {
        cordovaProgramPath: null,
      });
      expect(config.plugins.MeteorE2E.isBuild).toBe(true);
      expect(config.plugins.MeteorE2E.platform).toBe('android');
      await assertNoNativeLaunch(result.processResult.outputLines);
      await assertNoCordovaNativeBuild(result.processResult.outputLines);
    } finally {
      await cleanupTempDir(buildOutputDir);
    }
  });

  test('"meteor reset" clears generated Rspack and Capacitor build artifacts but keeps native project sources', async () => {
    await assertFileExist(tempDir, 'android');
    await assertFileExist(tempDir, 'capacitor.config.js');

    const result = await runMeteorCommand('reset', [], tempDir, {
      captureOutput: true,
      checkExitCode: true,
      env: e2eEnv(),
    });

    expectOutputContains(result.outputLines, /Project reset/);
    await assertPathNotExist(tempDir, '_build');
    await assertPathNotExist(tempDir, '.meteor/local/build');
    await assertPathNotExist(tempDir, '.meteor/local/bundler-cache');
    await assertPathNotExist(tempDir, '.meteor/local/plugin-cache');
    await assertPathNotExist(tempDir, 'node_modules/.cache/rspack');
    await assertFileExist(tempDir, 'android');
    await assertFileExist(tempDir, 'capacitor.config.js');
    await assertFileExist(tempDir, 'rspack.config.cjs');
  });

  test('"meteor run android" does not reinstall Capacitor deps on a repeated run', async () => {
    const result = await runMeteorApp(tempDir, PORT, {
      waitForOutput: /Capacitor native run skipped/,
      commandOptions: ['android'],
      env: e2eEnv({
        METEOR_CAPACITOR_SKIP_NATIVE_RUN: '1',
        METEOR_CAPACITOR_READY_URL: `http://127.0.0.1:${PORT}/`,
      }),
    });
    meteorProcess = result.meteorProcess;

    await assertNativeReactApp(PORT);
    expectOutputNotContains(result.outputLines, /Capacitor Dependencies/);
    expectOutputNotContains(result.outputLines, /Installed Capacitor dependencies/);
    await assertFileExist(tempDir, '_build/native-dev/capacitor.config.json');
  });
});
