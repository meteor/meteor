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
    DO_NOT_TRACK: '1',
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

async function ensureIosPlatform(appDir) {
  if (await fs.pathExists(path.join(appDir, 'ios', 'App', 'App.xcworkspace'))) {
    return;
  }

  await runMeteorCommand('add-platform', ['ios'], appDir, {
    captureOutput: true,
    checkExitCode: true,
    env: e2eEnv(),
  });
}

async function installNativeProdAppBlocker(appDir) {
  const packageName = 'native-prod-app-blocker';
  const packageDir = path.join(appDir, 'packages', packageName);
  const packagesPath = path.join(appDir, '.meteor', 'packages');
  const originalPackages = await fs.readFile(packagesPath, 'utf8');

  await fs.ensureDir(packageDir);
  await fs.writeFile(path.join(packageDir, 'package.js'), `
Package.describe({
  name: '${packageName}',
  version: '0.0.1'
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
});

Package.registerBuildPlugin({
  name: '${packageName}',
  sources: ['plugin.js'],
  use: ['isobuild:compiler-plugin@1.0.0']
});
`, 'utf8');
  await fs.writeFile(path.join(packageDir, 'plugin.js'), `
var fs = Plugin.fs;
var path = Plugin.path;

Plugin.registerCompiler({
  extensions: ['blocknativeprod']
}, function () {
  return {
    processFilesForTarget: function () {
      var blockedPath = path.join(process.cwd(), '_build', 'native-prod', 'app');
      fs.writeFileSync(blockedPath, 'stale capacitor output', 'utf8');
    }
  };
});
`, 'utf8');
  await fs.writeFile(path.join(packageDir, 'trigger.blocknativeprod'), '', 'utf8');
  await fs.writeFile(
    packagesPath,
    `${originalPackages.trimEnd()}\n${packageName}\n`,
    'utf8'
  );

  return async () => {
    await fs.writeFile(packagesPath, originalPackages, 'utf8');
    await fs.remove(packageDir);
  };
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
    await assertFileExist(appDir, 'android/app/src/main/assets/public/index.html');
    await assertFileExist(appDir, 'android/app/src/main/assets/public/program.json');
    await assertFileExist(appDir, 'android/app/src/main/assets/capacitor.config.json');
    return;
  }

  await assertFileExist(appDir, 'ios/App/App/public/index.html');
  await assertFileExist(appDir, 'ios/App/App/public/program.json');
  await assertFileExist(appDir, 'ios/App/App/capacitor.config.json');
}

async function assertCapacitorSyncedNativeAssetsForPlatforms(appDir, platforms) {
  for (const platform of platforms) {
    await assertCapacitorSyncedNativeAssets(appDir, platform);
  }
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
  await assertFileExist(appDir, `${webDir}/program.json`);
  await assertPathNotExist(appDir, `${webDir}/body.html`);
  await assertPathNotExist(appDir, `${webDir}/head.html`);
  await assertFileExist(appDir, `${webDir}/index.html`, { content: '__meteor_runtime_config__' });

  const indexHtml = await fs.readFile(path.join(appDir, webDir, 'index.html'), 'utf8');
  expect(indexHtml).not.toContain('var WebAppLocalServer');
  expect(indexHtml).toContain('window.WebAppLocalServer');
  expect(indexHtml).toContain('CapacitorMeteorWebApp');
  expect(indexHtml).not.toContain('__cordova/');

  const program = await readJson(appDir, `${webDir}/program.json`);
  for (const resource of program.manifest || []) {
    if (resource.url) {
      expect(resource.url).not.toContain('__cordova/');
    }
    if (resource.sourceMapUrl) {
      expect(resource.sourceMapUrl).not.toContain('__cordova/');
    }
  }

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
  expect(config.plugins.MeteorE2E.mode).toBe('bundled');
  expect(config.plugins.MeteorE2E.localIp).toBe('127.0.0.1');
  expect(config.plugins.MeteorE2E.port).toBe(String(PORT));

  expect(config.server.url).toBeUndefined();
  expect(config.server.androidScheme).toBe('http');
  expect(config.server.cleartext).toBe(
    config.plugins.MeteorE2E.isRun ? true : undefined
  );
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

    await page.waitForFunction(() => (
      document.querySelector('[data-testid="native-device-plugin"]')?.textContent ===
      'Device plugin ready: web'
    ));
    await page.waitForFunction(() => (
      document.querySelector('[data-testid="native-app-plugin"]')?.textContent ===
      'App plugin unavailable on web'
    ));

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

    await linkLocalRspack(tempDir, { env: e2eEnv() });
    await linkLocalCapacitor(tempDir, { env: e2eEnv() });

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
    expectOutputContains(addPlatformOutput, /Capacitor: installing .* npm package/);
    expectOutputContains(addPlatformOutput, /Capacitor: installed npm packages/);
    expectOutputContains(addPlatformOutput, /Capacitor: added android platform|android: added platform/);

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

    expectOutputContains(result.outputLines, /Capacitor: installing .* npm package/);
    expectOutputContains(result.outputLines, /Capacitor: installed npm packages/);
    expectOutputContains(result.outputLines, /Capacitor: added ios platform|ios: added platform/);

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
    await assertFileExist(tempDir, '_build/native-dev/program.json');
    const nativeDevIndex = await fs.readFile(path.join(tempDir, '_build/native-dev/index.html'), 'utf8');
    expect(nativeDevIndex).not.toContain('var WebAppLocalServer');
    expect(nativeDevIndex).toContain('window.WebAppLocalServer');
    expect(nativeDevIndex).toContain('CapacitorMeteorWebApp');

    await appendFileContent(tempDir, 'server/main.js', {
      content: `Meteor.startup(() => console.log("${SERVER_REBUILD_MESSAGE}"));`,
    });
    await waitForMeteorOutput(result.outputLines, SERVER_REBUILD_MESSAGE);
    await assertFileExist(tempDir, '_build/main-dev/server-rspack.js');

    expect(meteorProcess.exitCode).toBe(null);
    expect(meteorProcess.signalCode).toBe(null);
  });

  test('"meteor run android" in livereload mode keeps the server entry pointed at the app server module', async () => {
    const result = await runMeteorApp(tempDir, PORT, {
      waitForOutput: /Capacitor native run skipped/,
      commandOptions: ['android'],
      env: e2eEnv({
        METEOR_CAPACITOR_MODE: 'livereload',
        METEOR_CAPACITOR_SKIP_NATIVE_RUN: '1',
        METEOR_CAPACITOR_READY_URL: `http://127.0.0.1:${PORT}/`,
      }),
    });
    meteorProcess = result.meteorProcess;

    await assertRspackDevelopmentArtifacts(tempDir);

    const serverEntry = await fs.readFile(
      path.join(tempDir, '_build/main-dev/server-entry.js'),
      'utf8'
    );
    expect(serverEntry).toContain(`import '../../server/main.js';`);
    expect(serverEntry).not.toContain(`import '../../_build/main-dev/server-meteor.js';`);

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
      expect(config.server.url).toBeUndefined();
      expect(config.server.androidScheme).toBe('http');
      expect(config.server.cleartext).toBeUndefined();
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
      expect(config.server.url).toBeUndefined();
      expect(config.server.androidScheme).toBe('http');
      expect(config.server.cleartext).toBeUndefined();
      await assertNoNativeLaunch(result.processResult.outputLines);
      await assertNoCordovaNativeBuild(result.processResult.outputLines);
    } finally {
      await cleanupTempDir(buildOutputDir);
    }
  });

  test('"meteor build --platforms=android" uses the temporary tar bundle for Capacitor sync', async () => {
    let buildOutputDir;

    await fs.remove(path.join(tempDir, '.meteor/local/build/programs/web.cordova'));
    await fs.remove(path.join(tempDir, '_build/native-prod'));

    try {
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--platforms=android', '--server=http://127.0.0.1:3000'],
        captureOutput: true,
        env: e2eEnv(),
      });
      buildOutputDir = result.buildOutputDir;

      await assertFileExist(buildOutputDir, `${path.basename(tempDir)}.tar.gz`);
      await assertPathNotExist(buildOutputDir, 'bundle/programs/web.cordova/program.json');

      const config = await assertCapacitorWebDir(tempDir, 'prod', 'android', {
        cordovaProgramPath: null,
      });
      expect(config.plugins.MeteorE2E.isBuild).toBe(true);
      expect(config.plugins.MeteorE2E.isRun).toBe(false);
      expect(config.plugins.MeteorE2E.platform).toBe('android');
      await assertNoNativeLaunch(result.processResult.outputLines);
      await assertNoCordovaNativeBuild(result.processResult.outputLines);
    } finally {
      await cleanupTempDir(buildOutputDir);
    }
  });

  test('"meteor build --directory --platforms=android,ios" syncs all Capacitor native projects', async () => {
    let buildOutputDir;

    await ensureIosPlatform(tempDir);

    try {
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--platforms=android,ios', '--server=http://127.0.0.1:3000'],
        captureOutput: true,
        env: e2eEnv(),
      });
      buildOutputDir = result.buildOutputDir;

      await assertFileExist(buildOutputDir, 'bundle/programs/web.cordova/program.json');
      await assertCapacitorSyncedNativeAssetsForPlatforms(tempDir, ['android', 'ios']);

      const config = await readJson(tempDir, '_build/native-prod/capacitor.config.json');
      expect(config.webDir).toBe('_build/native-prod');
      expect(config.plugins.MeteorE2E.isBuild).toBe(true);
      expect(config.plugins.MeteorE2E.isRun).toBe(false);
      expect(config.plugins.MeteorE2E.webDir).toBe('_build/native-prod');
      expect(config.server.url).toBeUndefined();
      expect(config.server.androidScheme).toBe('http');
      expect(config.server.cleartext).toBeUndefined();
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

  test('"meteor build --directory --platforms=android" fails instead of reusing stale Capacitor output', async () => {
    const buildOutputDir = path.join(tempDir, '_build-missing-web-cordova');
    let uninstallBlocker;

    await fs.remove(buildOutputDir);
    await fs.remove(path.join(tempDir, '_build/native-prod'));

    try {
      uninstallBlocker = await installNativeProdAppBlocker(tempDir);

      const result = await runMeteorCommand(
        'build',
        [buildOutputDir, '--directory', '--platforms=android', '--server=http://127.0.0.1:3000'],
        tempDir,
        {
          captureOutput: true,
          logCapturedOutput: false,
          env: e2eEnv(),
        }
      );

      let exitCode = 0;
      try {
        await result.meteorProcess;
      } catch (error) {
        exitCode = error.exitCode;
      }

      expect(exitCode).not.toBe(0);
      expectOutputContains(
        result.outputLines,
        /Capacitor build sync failed|Capacitor transform failed|failed to sync bundle files/i
      );
      expect(await fs.readFile(path.join(tempDir, '_build/native-prod/app'), 'utf8'))
        .toBe('stale capacitor output');
    } finally {
      if (uninstallBlocker) {
        await uninstallBlocker();
      }
      await cleanupTempDir(buildOutputDir);
      await fs.remove(path.join(tempDir, '_build/native-prod'));
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
    expectOutputNotContains(result.outputLines, /Capacitor: installing .* npm package/);
    expectOutputNotContains(result.outputLines, /Capacitor: installed npm packages/);
    await assertFileExist(tempDir, '_build/native-dev/capacitor.config.json');
  });
});
