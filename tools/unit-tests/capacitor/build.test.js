const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('meteor/tools-core/lib/meteor', () => ({
  getMeteorAppDir: () => process.cwd(),
  isMeteorAppDevelopment: () => false,
  isMeteorAppProduction: () => true,
  isMeteorAppDebug: () => false,
  isMeteorAppConfigModernVerbose: () => false,
}), { virtual: true });
jest.mock('meteor/tools-core/lib/log', () => ({ logInfo() {}, logError() {} }), { virtual: true });
jest.mock('meteor/tools-core/lib/git', () => ({}), { virtual: true });
jest.mock('meteor/tools-core/lib/global-state', () => ({}), { virtual: true });

const { getNativeBuildPlatforms, getNativeBuildRequest, prepareNativeArtifacts, collectNativeArtifacts } = require('../../../packages/capacitor/lib/build');
const { loadResolvedCapacitorConfig, writeResolvedConfigSnapshot } = require('../../../packages/capacitor/lib/build-context');

let appDir;
beforeEach(() => { appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capacitor-build-')); });
afterEach(() => { fs.rmSync(appDir, { recursive: true, force: true }); });

function request(platform, config = {}, options = {}) {
  return getNativeBuildRequest({ appDir, platform, config, options, outputDir: path.join(appDir, 'output') });
}

test('platform selection ignores the build output argument and respects explicit provider aliases', () => {
  expect(getNativeBuildPlatforms({ args: ['ios'] }, ['browser', 'android'])).toEqual(['android']);
  expect(getNativeBuildPlatforms({ platforms: 'capacitor:ios,cordova:android,web.browser,capacitor:ios' }, ['android'])).toEqual(['ios']);
});

test('signing configuration remains usable but is excluded from the web snapshot', async () => {
  const config = { appId: 'example.app', android: { flavor: 'demo', buildOptions: { keystorePassword: 'private-test-sentinel' } }, ios: { buildOptions: { provisioningProfile: 'private-profile' } }, plugins: { Example: { enabled: true } } };
  fs.writeFileSync(path.join(appDir, 'capacitor.config.json'), JSON.stringify(config));
  await writeResolvedConfigSnapshot({ appDir });
  const snapshot = JSON.parse(fs.readFileSync(path.join(appDir, '_build/native-prod/capacitor.config.json')));
  expect(snapshot.android).toEqual({ flavor: 'demo' });
  expect(snapshot.ios).toEqual({});
  expect(snapshot.plugins).toEqual(config.plugins);
  expect(await loadResolvedCapacitorConfig({ appDir })).toEqual(config);
});

test('Android keeps the configured format unless Meteor explicitly overrides it', () => {
  const config = { android: { path: 'mobile/android', flavor: 'demo', buildOptions: { releaseType: 'APK' } } };
  const configured = request('android', config);
  expect(configured.args).toEqual(['build', 'android']);
  expect(configured.artifactPaths).toEqual([path.join(appDir, 'mobile/android/app/build/outputs/apk/demo/release/app-demo-release-signed.apk')]);
  const overridden = request('android', config, { packageType: 'bundle' });
  expect(overridden.args).toEqual(['build', 'android', '--androidreleasetype', 'AAB']);
  expect(overridden.artifactPaths[0]).toBe(path.join(appDir, 'mobile/android/app/build/outputs/bundle/demoRelease/app-demo-release-signed.aab'));
});

test('TypeScript configuration takes precedence and retains native build settings', async () => {
  const nodeModules = path.join(appDir, 'node_modules');
  fs.mkdirSync(nodeModules);
  fs.symlinkSync(path.dirname(require.resolve('typescript/package.json')), path.join(nodeModules, 'typescript'), 'junction');
  fs.writeFileSync(path.join(appDir, 'capacitor.config.js'), 'module.exports = { appId: "wrong.config" };');
  fs.writeFileSync(path.join(appDir, 'capacitor.config.ts'), 'const config: { appId: string, android: object } = { appId: "typed.app", android: { flavor: "demo", buildOptions: { releaseType: "APK" } } }; export default config;');
  const config = await loadResolvedCapacitorConfig({ appDir });
  expect(config.appId).toBe('typed.app');
  expect(request('android', config).artifactPaths[0]).toBe(path.join(appDir, 'android/app/build/outputs/apk/demo/release/app-demo-release-signed.apk'));
});

test.each([['apk', 'assembleDemoDebug', 'apk/demo/debug/app-demo-debug.apk'], ['bundle', ':app:bundleDemoDebug', 'bundle/demoDebug/app-demo-debug.aab']])('Android debug honors %s and the configured flavor', (packageType, task, artifact) => {
  const build = request('android', { android: { flavor: 'demo' } }, { debug: true, packageType });
  expect(build.gradleTask).toBe(task);
  expect(build.artifactPaths).toEqual([path.join(appDir, 'android/app/build/outputs', artifact)]);
});

test('iOS keeps Capacitor scheme/signing resolution and maps Meteor debug explicitly', () => {
  const build = request('ios', { ios: { path: 'mobile/ios', scheme: 'Demo' } }, { debug: true });
  expect(build.args).toEqual(['build', 'ios', '--configuration', 'Debug']);
  expect(build.artifactDir).toBe(path.join(appDir, 'mobile/ios/App/output'));
  expect(build.nativeDir).toBe(path.join(appDir, 'mobile/ios'));
});

test('invalid Android package types fail before invoking a builder', () => {
  expect(() => request('android', {}, { packageType: 'zip' })).toThrow(/packageType/);
  expect(() => request('android', { android: { buildOptions: { releaseType: 'ZIP' } } })).toThrow(/releaseType/);
});

test('a stale Android artifact cannot satisfy a new build, and a fresh artifact reaches the final destination', async () => {
  const build = request('android');
  fs.mkdirSync(path.dirname(build.artifactPaths[0]), { recursive: true });
  fs.writeFileSync(build.artifactPaths[0], 'stale');
  await prepareNativeArtifacts(build);
  await expect(collectNativeArtifacts(build)).rejects.toThrow(/did not produce/);
  fs.writeFileSync(build.artifactPaths[0], 'fresh');
  const outputs = await collectNativeArtifacts(build);
  expect(outputs).toEqual([path.join(appDir, 'output/android/app-release-signed.aab')]);
  expect(fs.readFileSync(outputs[0], 'utf8')).toBe('fresh');
});

test('iOS clears only generated IPAs and collects fresh exports without removing project files', async () => {
  const build = request('ios');
  fs.mkdirSync(build.artifactDir, { recursive: true });
  fs.writeFileSync(path.join(build.artifactDir, 'old.ipa'), 'stale');
  fs.writeFileSync(path.join(build.artifactDir, 'ExportOptions.plist'), 'keep');
  await prepareNativeArtifacts(build);
  await expect(collectNativeArtifacts(build)).rejects.toThrow(/did not produce/);
  fs.writeFileSync(path.join(build.artifactDir, 'Demo.ipa'), 'fresh');
  expect(await collectNativeArtifacts(build)).toEqual([path.join(appDir, 'output/ios/Demo.ipa')]);
  expect(fs.readFileSync(path.join(build.artifactDir, 'ExportOptions.plist'), 'utf8')).toBe('keep');
});
