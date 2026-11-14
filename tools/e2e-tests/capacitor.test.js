import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';

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

// Keep the real Meteor transform and cap sync. Control only release compilation
// and signing at the CLI process boundary; real artifacts have separate checks.
async function installCapBuildStub(appDir) {
  const cliPath = path.join(appDir, 'node_modules/@capacitor/cli/bin/capacitor');
  const original = await fs.readFile(cliPath, 'utf8');
  if (original.includes('// meteor e2e native build boundary')) return;
  const stub = `
// meteor e2e native build boundary
if (process.argv[2] === 'build') {
  return (async () => {
  const fs = require('fs');
  const path = require('path');
  const config = (await require('../dist/config').loadConfig()).app.extConfig;
  const platform = process.argv[3];
  const formatIndex = process.argv.indexOf('--androidreleasetype');
  const format = formatIndex >= 0 ? process.argv[formatIndex + 1] : config.android?.buildOptions?.releaseType || 'AAB';
  const nativeDir = path.resolve(config[platform]?.path || platform);
  const syncedIndex = platform === 'ios' ? 'App/App/public/index.html' : 'app/src/main/assets/public/index.html';
  if (!fs.existsSync(path.join(nativeDir, syncedIndex))) throw new Error('Build invoked before native sync');
  const result = { platform, args: process.argv.slice(2), format, appId: config.appId,
    rootUrl: config.plugins.MeteorE2E.rootUrl,
    hasSigningConfig: config.android?.buildOptions?.keystorePassword === 'e2e-signing-secret' };
  console.log('build settings: ' + config.android?.buildOptions?.keystorePassword);
  const callsPath = path.join('_build', 'native-build-calls.json');
  const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath)) : [];
  fs.writeFileSync(callsPath, JSON.stringify([...calls, result]));
  if (process.env.CAPACITOR_E2E_BUILD_EXIT) process.exit(Number(process.env.CAPACITOR_E2E_BUILD_EXIT));
  if (process.env.CAPACITOR_E2E_BUILD_SKIP_ARTIFACT) process.exit(0);
  const artifact = platform === 'ios'
    ? path.join(nativeDir, 'App/output/fixture.ipa')
    : path.join(nativeDir, 'app/build/outputs', format === 'APK' ? 'apk' : 'bundle', 'release', 'app-release-signed.' + format.toLowerCase());
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, JSON.stringify(result));
  process.exit(0);
  })().catch(error => { console.error(error); process.exit(1); });
}
`;
  await fs.writeFile(cliPath, original.replace(/^(#![^\n]*\n)/, '$1' + stub));
}

async function assertNativeServerUrl(appDir, platform, rootUrl) {
  const nativeDir = platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public';
  for (const webDir of ['_build/native-prod', nativeDir]) {
    const html = await fs.readFile(path.join(appDir, webDir, 'index.html'), 'utf8');
    const match = html.match(/__meteor_runtime_config__ = JSON\.parse\(decodeURIComponent\((.+?)\)\);/);
    expect(match).not.toBeNull();
    const config = JSON.parse(decodeURIComponent(JSON.parse(match[1])));
    expect(config.ROOT_URL).toBe(rootUrl);
    expect(config.DDP_DEFAULT_CONNECTION_URL).toBe(rootUrl);
    expect(config.ROOT_URL_PATH_PREFIX).toBe(new URL(rootUrl).pathname.replace(/\/$/, ''));
  }
  const snapshot = await readJson(appDir, '_build/native-prod/capacitor.config.json');
  expect(snapshot.plugins.MeteorE2E.rootUrl).toBe(rootUrl);
  expect(snapshot.server.cleartext).toBe(new URL(rootUrl).protocol === 'http:' ? true : undefined);
}

async function ensureIosPlatform(appDir) {
  if (await fs.pathExists(path.join(appDir, 'ios', 'App', 'App.xcodeproj'))) {
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
  await assertFileExist(appDir, '_build/main-dev/server-rspack.cjs');
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
  expectOutputNotContains(outputLines, /Capacitor:?(?: launching on| launching) /);
  expectOutputNotContains(outputLines, /emulator/i);
  expectOutputNotContains(outputLines, /simulator/i);
  expectOutputNotContains(outputLines, /Android Studio/i);
  // Neither an optional clean warning nor project scaffolding launches an IDE.
  // Other Xcode output would escape this suite's native compilation boundary.
  const launchOutput = outputLines.filter(line => !line.includes(
    'Unable to find "xcodebuild". Skipping xcodebuild clean step...'
  ) && !line.includes('Adding native Xcode project in'));
  expectOutputNotContains(launchOutput, /Xcode/i);
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
    expect(await page.$eval('[data-testid="native-runtime"]', el => el.textContent)).toBe('Web');

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
    await installCapBuildStub(tempDir);
    await fs.remove(path.join(tempDir, '_build/native-build-calls.json'));
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

  test('"meteor types" exposes Capacitor runtime and WebApp hooks to TypeScript apps', async () => {
    await runMeteorCommand('types', [], tempDir, {
      captureOutput: true,
      checkExitCode: true,
      env: e2eEnv(),
    });
    await assertFileExist(tempDir, '.meteor/types/packages.d.ts', {
      content: 'packages/capacitor/index.d.ts',
    });
    await runMeteorCommand('node', ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'], tempDir, {
      captureOutput: true,
      checkExitCode: true,
      env: e2eEnv(),
    });
  });

  test('"meteor add-platform android" installs deps and creates native context', async () => {
    expectOutputContains(addPlatformOutput, /Capacitor: updating npm dependencies/);
    expectOutputContains(addPlatformOutput, /Capacitor dependencies are up to date/);
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
    for (const name of ['core', 'cli', 'android']) {
      const installed = await readJson(tempDir, `node_modules/@capacitor/${name}/package.json`);
      expect(semver.satisfies(installed.version, '>=8.6.2 <9.0.0')).toBe(true);
    }
    await assertFileExist(tempDir, '.meteor/platforms', { content: 'android' });
    await assertFileExist(tempDir, 'android');
    await assertFileExist(tempDir, '.gitignore', { content: '_build' });
    await assertFileExist(tempDir, '.gitignore', { content: 'android/app/src/main/assets/public' });
    await assertFileExist(tempDir, '.gitignore', { content: 'android/app/src/main/assets/capacitor.*.json' });
  });

  test('manual dependency mode blocks native preparation, while "meteor update --npm" repairs missing tools', async () => {
    const originalManifest = await readJson(tempDir, 'package.json');
    const configPath = path.join(tempDir, 'capacitor.config.js');
    const originalConfig = await fs.readFile(configPath, 'utf8');
    const buildOutputDir = path.join(tempDir, '_build-manual-deps');

    try {
      await fs.writeJson(path.join(tempDir, 'package.json'), {
        ...originalManifest,
        meteor: { ...originalManifest.meteor, autoInstallDeps: false },
      });
      await fs.remove(path.join(tempDir, 'node_modules/@capacitor/cli'));
      const build = await runMeteorCommand('build', [
        buildOutputDir, '--directory', '--platforms=android', '--server=http://127.0.0.1:3000',
      ], tempDir, { captureOutput: true, logCapturedOutput: false, env: e2eEnv() });
      await expect(build.meteorProcess).rejects.toMatchObject({ exitCode: 1 });
      expectOutputContains(build.outputLines, /Automatic dependency installation is disabled/);
      expectOutputContains(build.outputLines, /meteor npm install --save-dev @capacitor\/cli@/);
      expectOutputNotContains(build.outputLines, /Capacitor: syncing/);
      await assertPathNotExist(tempDir, 'node_modules/@capacitor/cli');

      // The explicit update overrides manual mode without scaffolding a config
      // or invoking native synchronization. Restore the source config afterward.
      await fs.remove(configPath);
      const update = await runMeteorCommand('update', ['--npm'], tempDir, {
        captureOutput: true, checkExitCode: true, env: e2eEnv(),
      });
      await assertFileExist(tempDir, 'node_modules/@capacitor/cli/package.json');
      await assertPathNotExist(tempDir, 'capacitor.config.js');
      expectOutputNotContains(update.outputLines, /Capacitor: (?:syncing|adding|launching)/);
      expect((await readJson(tempDir, 'package.json')).meteor.autoInstallDeps).toBe(false);
    } finally {
      await fs.writeFile(configPath, originalConfig);
      const manifest = await readJson(tempDir, 'package.json');
      await fs.writeJson(path.join(tempDir, 'package.json'), { ...manifest, meteor: originalManifest.meteor });
      await cleanupTempDir(buildOutputDir);
    }
  });

  test('"meteor add-platform ios" installs deps and creates native context', async () => {
    const result = await runMeteorCommand('add-platform', ['ios'], tempDir, {
      captureOutput: true,
      checkExitCode: true,
      env: e2eEnv(),
    });

    expectOutputContains(result.outputLines, /Capacitor: updating npm dependencies/);
    expectOutputContains(result.outputLines, /Capacitor dependencies are up to date/);
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
    await assertFileExist(tempDir, 'ios/App/App.xcodeproj');
    await assertFileExist(tempDir, 'ios/App/CapApp-SPM/Package.swift', { content: 'MeteorjsCapacitor' });
    expect(semver.satisfies((await readJson(tempDir, 'node_modules/@capacitor/ios/package.json')).version, '>=8.6.2 <9.0.0')).toBe(true);
    await assertFileExist(tempDir, '.gitignore', { content: '_build' });
    await assertFileExist(tempDir, '.gitignore', { content: 'ios/App/App/public' });
    await assertFileExist(tempDir, '.gitignore', { content: 'ios/App/App/capacitor.*.json' });
    await assertFileExist(tempDir, '.gitignore', { content: 'ios/App/App/config.xml' });
  });

  test('"meteor run android" upgrades older Capacitor 8 packages, serves web app and prepares Capacitor webDir', async () => {
    const olderPackages = [];
    for (const name of ['core', 'cli', 'android', 'ios']) {
      if (await fs.pathExists(path.join(tempDir, `node_modules/@capacitor/${name}/package.json`))) {
        olderPackages.push(`@capacitor/${name}@8.0.0`);
      }
    }
    await runMeteorCommand('npm', ['install', '--save-exact', '--no-audit', '--no-fund', ...olderPackages], tempDir, {
      captureOutput: true, checkExitCode: true, env: e2eEnv(),
    });
    for (const name of ['core', 'cli', 'android']) {
      expect((await readJson(tempDir, `node_modules/@capacitor/${name}/package.json`)).version).toBe('8.0.0');
    }
    // A previous native run leaves a complete document in the shared build
    // root. Rspack must not re-include it as an app template during startup.
    await fs.outputFile(path.join(tempDir, '_build/native-dev/index.html'),
      '<!DOCTYPE html><html><head><title>Previous native build</title></head><body></body></html>');
    const result = await runMeteorApp(tempDir, PORT, {
      waitForOutput: /Capacitor native run skipped/,
      commandOptions: ['android'],
      env: e2eEnv({
        METEOR_CAPACITOR_SKIP_NATIVE_RUN: '1',
        METEOR_CAPACITOR_READY_URL: `http://127.0.0.1:${PORT}/`,
      }),
    });
    meteorProcess = result.meteorProcess;

    expectOutputContains(result.outputLines, /Capacitor: updating npm dependencies/);
    for (const name of ['core', 'cli', 'android']) {
      expect((await readJson(tempDir, `node_modules/@capacitor/${name}/package.json`)).version).toBe('8.6.2');
    }

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
    await assertFileExist(tempDir, '_build/main-dev/server-rspack.cjs');

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

  test('"meteor build --directory --platforms=android" packages synchronized assets through the Capacitor CLI', async () => {
    let buildOutputDir;

    try {
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--platforms=android', '--packageType=bundle', '--server=https://mobile.example.com/app/'],
        captureOutput: true,
        env: e2eEnv({ ROOT_URL: 'http://wrong-host:3000/', MOBILE_ROOT_URL: 'http://wrong-mobile:3000/', CAPACITOR_E2E_ANDROID_FORMAT: 'APK' }),
      });
      buildOutputDir = result.buildOutputDir;
      await assertNativeServerUrl(tempDir, 'android', 'https://mobile.example.com/app/');
      const artifact = await readJson(buildOutputDir, 'android/app-release-signed.aab');
      expect(artifact).toMatchObject({ platform: 'android', format: 'AAB', hasSigningConfig: true, rootUrl: 'https://mobile.example.com/app/' });
      expect(artifact.args).toEqual(['build', 'android', '--androidreleasetype', 'AAB']);
      expect(JSON.stringify(await readJson(tempDir, '_build/native-prod/capacitor.config.json'))).not.toContain('e2e-signing-secret');
      expect(JSON.stringify(await readJson(tempDir, 'android/app/src/main/assets/capacitor.config.json'))).not.toContain('e2e-signing-secret');
      expectOutputNotContains(result.processResult.outputLines, /e2e-signing-secret/);

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

  test('native builds require an explicit server URL before preparing native output', async () => {
    const output = path.join(tempDir, '..', `${path.basename(tempDir)}-missing-server`);
    try {
      const result = await runMeteorCommand('build', [output, '--directory', '--platforms=android'], tempDir, {
        captureOutput: true, env: e2eEnv({ ROOT_URL: '', MOBILE_ROOT_URL: '' }),
      });
      await expect(result.meteorProcess).rejects.toMatchObject({ exitCode: 1 });
      expectOutputContains(result.outputLines, /--server/);
      expectOutputNotContains(result.outputLines, /Capacitor: syncing/);
      await assertPathNotExist(path.dirname(output), path.basename(output));
    } finally {
      await cleanupTempDir(output);
    }
  });

  test('web-only builds do not require a mobile server or synchronize native projects', async () => {
    let output;
    try {
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--platforms=web.browser'],
        captureOutput: true, env: e2eEnv({ ROOT_URL: '', MOBILE_ROOT_URL: '' }),
      });
      output = result.buildOutputDir;
      await assertFileExist(output, 'bundle/programs/web.browser/program.json');
      await assertPathNotExist(output, 'bundle/programs/web.cordova');
      expectOutputNotContains(result.processResult.outputLines, /Capacitor: syncing/);
    } finally {
      await cleanupTempDir(output);
    }
  });

  test('native builds accept an explicit MOBILE_ROOT_URL without --server', async () => {
    let output;
    try {
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--platforms=android'],
        captureOutput: true,
        env: e2eEnv({ MOBILE_ROOT_URL: 'https://environment.example.com/app/', ROOT_URL: 'http://wrong-host:3000/', CAPACITOR_E2E_ANDROID_FORMAT: 'APK' }),
      });
      output = result.buildOutputDir;
      await assertNativeServerUrl(tempDir, 'android', 'https://environment.example.com/app/');
      const artifact = await readJson(output, 'android/app-release-signed.apk');
      expect(artifact.args).toEqual(['build', 'android']);
      expect(artifact.format).toBe('APK');
    } finally {
      await cleanupTempDir(output);
    }
  });

  test('"meteor build --directory --platforms=ios" collects the selected Capacitor IPA export', async () => {
    let buildOutputDir;

    try {
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--platforms=ios', '--server=http://127.0.0.1:3000'],
        captureOutput: true,
        env: e2eEnv(),
      });
      buildOutputDir = result.buildOutputDir;
      await assertNativeServerUrl(tempDir, 'ios', 'http://127.0.0.1:3000/');
      expect(await readJson(buildOutputDir, 'ios/fixture.ipa')).toMatchObject({ platform: 'ios', args: ['build', 'ios'] });

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
      expect(config.server.cleartext).toBe(true);
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
        commandOptions: ['--platforms=android', '--server=mobile.example.com/app/'],
        captureOutput: true,
        env: e2eEnv(),
      });
      buildOutputDir = result.buildOutputDir;
      await assertNativeServerUrl(tempDir, 'android', 'http://mobile.example.com/app/');
      expect(await readJson(buildOutputDir, 'android/app-release-signed.aab')).toMatchObject({ platform: 'android' });

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

  test('"meteor build --directory --platforms=android,ios" packages selected native projects sequentially', async () => {
    let buildOutputDir;
    const configTs = path.join(tempDir, 'capacitor.config.ts');

    await ensureIosPlatform(tempDir);

    try {
      const source = await fs.readFile(path.join(tempDir, 'capacitor.config.js'), 'utf8');
      await fs.writeFile(configTs, source
        .replace('module.exports =', "const config: import('@capacitor/cli').CapacitorConfig =")
        .replace('platform: Meteor.platform,', "platform: Meteor.platform, configType: 'typescript',") + '\nexport default config;\n');
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--platforms=android,ios', '--server=http://127.0.0.1:3000'],
        captureOutput: true,
        env: e2eEnv(),
      });
      buildOutputDir = result.buildOutputDir;

      await assertFileExist(buildOutputDir, 'bundle/programs/web.cordova/program.json');
      await assertCapacitorSyncedNativeAssetsForPlatforms(tempDir, ['android', 'ios']);
      expect((await readJson(tempDir, '_build/native-build-calls.json')).map(call => call.platform)).toEqual(['android', 'ios']);
      await assertFileExist(buildOutputDir, 'android/app-release-signed.aab');
      await assertFileExist(buildOutputDir, 'ios/fixture.ipa');
      for (const [platform, configPath] of [
        ['android', 'android/app/src/main/assets/capacitor.config.json'],
        ['ios', 'ios/App/App/capacitor.config.json'],
      ]) {
        expect((await readJson(tempDir, configPath)).plugins.MeteorE2E).toMatchObject({ platform, configType: 'typescript' });
      }

      const config = await readJson(tempDir, '_build/native-prod/capacitor.config.json');
      expect(config.webDir).toBe('_build/native-prod');
      expect(config.plugins.MeteorE2E.isBuild).toBe(true);
      expect(config.plugins.MeteorE2E.isRun).toBe(false);
      expect(config.plugins.MeteorE2E.webDir).toBe('_build/native-prod');
      expect(config.server.url).toBeUndefined();
      expect(config.server.androidScheme).toBe('http');
      expect(config.server.cleartext).toBe(true);
      await assertNoNativeLaunch(result.processResult.outputLines);
      await assertNoCordovaNativeBuild(result.processResult.outputLines);
    } finally {
      await fs.remove(configTs);
      await cleanupTempDir(buildOutputDir);
    }
  });

  test('native builds use configured platforms when --platforms is omitted, leaving other native projects alone', async () => {
    const platformsPath = path.join(tempDir, '.meteor/platforms');
    const original = await fs.readFile(platformsPath, 'utf8');
    let output;
    try {
      await ensureIosPlatform(tempDir);
      await fs.writeFile(platformsPath, original.split('\n').filter(platform => platform !== 'ios').join('\n'));
      const result = await buildMeteorApp(tempDir, {
        commandOptions: ['--directory', '--server=https://mobile.example.com/'],
        captureOutput: true, env: e2eEnv(),
      });
      output = result.buildOutputDir;
      expect((await readJson(tempDir, '_build/native-build-calls.json')).map(call => call.platform)).toEqual(['android']);
      await assertFileExist(output, 'android/app-release-signed.aab');
      await assertPathNotExist(output, 'ios');
      await assertFileExist(tempDir, 'ios');
    } finally {
      await fs.writeFile(platformsPath, original);
      await cleanupTempDir(output);
    }
  });

  test.each([
    ['fails', { CAPACITOR_E2E_BUILD_EXIT: '29' }, /cap build android exited with code 29/],
    ['does not produce a fresh artifact', { CAPACITOR_E2E_BUILD_SKIP_ARTIFACT: '1' }, /did not produce/],
  ])('"meteor build" fails when the native builder %s', async (label, env, message) => {
    const output = path.join(tempDir, '_build-failed-native-package');
    const artifact = path.join(tempDir, 'android/app/build/outputs/bundle/release/app-release-signed.aab');
    try {
      await fs.outputFile(artifact, 'stale native artifact');
      const result = await runMeteorCommand('build', [
        output, '--directory', '--platforms=android', '--server=https://mobile.example.com/',
      ], tempDir, { captureOutput: true, logCapturedOutput: false, env: e2eEnv(env) });
      await expect(result.meteorProcess).rejects.toMatchObject({ exitCode: 1 });
      expectOutputContains(result.outputLines, /Capacitor: synced android/);
      expectOutputContains(result.outputLines, message);
      expectOutputNotContains(result.outputLines, /Capacitor android artifact:/);
      await assertPathNotExist(output, 'android/app-release-signed.aab');
      await assertPathNotExist(tempDir, 'android/app/build/outputs/bundle/release/app-release-signed.aab');
    } finally {
      await cleanupTempDir(output);
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
      expect((await readJson(tempDir, '_build/native-build-calls.json')).map(call => call.platform)).toEqual(['android']);
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

  test('"meteor build" fails when the Capacitor CLI cannot sync the native project', async () => {
    const cliPath = path.join(tempDir, 'node_modules/@capacitor/cli/bin/capacitor');
    const originalCli = await fs.readFile(cliPath, 'utf8');
    const buildOutputDir = path.join(tempDir, '_build-failed-native-sync');

    try {
      // Fail at the child-process boundary after the web bundle is generated.
      // This catches treating a resolved, nonzero exit code as a successful sync.
      await fs.writeFile(cliPath, originalCli.replace(/^(#![^\n]*\n)/, `$1
if (process.argv[2] === 'sync') {
  console.error('intentional native sync failure');
  process.exit(23);
}
`));
      const build = await runMeteorCommand('build', [
        buildOutputDir, '--directory', '--platforms=android', '--server=http://127.0.0.1:3000',
      ], tempDir, { captureOutput: true, logCapturedOutput: false, env: e2eEnv() });
      const exitCode = await build.meteorProcess.then(
        result => result.exitCode,
        error => error.exitCode,
      );
      expect(exitCode).toBe(1);
      expectOutputContains(build.outputLines, /intentional native sync failure/);
      expectOutputContains(build.outputLines, /cap sync android exited with code 23/);
      expectOutputNotContains(build.outputLines, /Capacitor: synced/);
      await assertNoNativeLaunch(build.outputLines);
    } finally {
      await fs.writeFile(cliPath, originalCli);
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
    expectOutputNotContains(result.outputLines, /Capacitor: updating npm dependencies/);
    expectOutputNotContains(result.outputLines, /Capacitor dependencies are up to date/);
    await assertFileExist(tempDir, '_build/native-dev/capacitor.config.json');
  });
});

describe('Capacitor App Web Lifecycle / Blaze', () => {
  let appDir;
  let meteorProcess;
  const port = 3135;
  const env = () => e2eEnv({ PORT: String(port), RSPACK_DEVSERVER_PORT: '18135' });

  beforeAll(async () => {
    appDir = (await setupMeteorApp('blaze')).tempDir;
    await runMeteorCommand('add', ['rspack', 'capacitor'], appDir, { captureOutput: true, checkExitCode: true, env: env() });
    await linkLocalRspack(appDir, { env: env() });
    await linkLocalCapacitor(appDir, { env: env() });
    await runMeteorCommand('add-platform', ['android'], appDir, { captureOutput: true, checkExitCode: true, env: env() });
  });

  afterEach(async () => {
    if (meteorProcess) {
      await killMeteorProcess(meteorProcess);
      meteorProcess = null;
    }
    await killStrayAppProcesses();
  });

  afterAll(async () => {
    await cleanupTempDir(appDir);
  });

  async function assertBlazeInteraction() {
    await page.goto(`http://localhost:${port}/`);
    await page.waitForSelector('button');
    await page.waitForFunction(() => document.body.textContent.includes("You've pressed the button 0 times."));
    await page.click('button');
    await page.waitForFunction(() => document.body.textContent.includes("You've pressed the button 1 times."));
  }

  test('bundled native development loads Blaze helpers and click handlers', async () => {
    const result = await runMeteorApp(appDir, port, {
      commandOptions: ['android'],
      waitForOutput: /Capacitor native run skipped/,
      env: { ...env(), METEOR_CAPACITOR_SKIP_NATIVE_RUN: '1', METEOR_CAPACITOR_READY_URL: `http://127.0.0.1:${port}/` },
    });
    meteorProcess = result.meteorProcess;
    await assertBlazeInteraction();
    await assertFileExist(appDir, '_build/native-dev/index.html');
  });

  test('plain web development ignores native projects and generated webDirs after native generation', async () => {
    const generatedHtml = await fs.readFile(path.join(appDir, '_build/native-dev/index.html'), 'utf8');
    await fs.outputFile(path.join(appDir, 'ios/App/App/public/index.html'), generatedHtml);
    await fs.outputFile(path.join(appDir, '_build/native-prod/index.html'), generatedHtml);
    const result = await runMeteorApp(appDir, port, { env: env() });
    meteorProcess = result.meteorProcess;
    await assertBlazeInteraction();
    expectOutputNotContains(result.outputLines, /Capacitor: (?:syncing|launching|added)/);
  });
});
