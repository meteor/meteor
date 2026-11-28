const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('meteor/tools-core/lib/log', () => ({ logError: jest.fn(), logRaw: jest.fn(), logInfo() {}, logProgress() {}, logSuccess() {} }), { virtual: true });
jest.mock('meteor/tools-core/lib/process', () => require('../../../packages/tools-core/lib/process'), { virtual: true });
jest.mock('meteor/tools-core/lib/global-state', () => ({ getGlobalState: () => null, setGlobalState() {} }), { virtual: true });
jest.mock('meteor/tools-core/lib/readiness', () => require('../../../packages/tools-core/lib/readiness'), { virtual: true });
jest.mock('meteor/tools-core/lib/npm', () => ({ getNodeBinEnv: () => ({}), getNpxCommand: args => ({ command: '/missing/native-builder', args }) }), { virtual: true });
jest.mock('meteor/tools-core/lib/meteor', () => ({
  getNativeCommandEnv: () => ({ NODE_ENV: 'production' }),
  getMeteorAppDir: () => process.cwd(), inheritMeteorToolNodeFlags: env => env,
  isMeteorAppDevelopment: () => false, isMeteorAppProduction: () => true,
  isMeteorAppDebug: () => false, isMeteorAppConfigModernVerbose: jest.fn(() => true),
  isMeteorAppNativeAndroid: () => false, isMeteorAppNativeIos: () => false,
}), { virtual: true });
const { addNativePlatformIfMissing, runCapBuild, runCapSync } = require('../../../packages/capacitor/lib/processes');
const { isMeteorAppConfigModernVerbose } = require('meteor/tools-core/lib/meteor');
const { logError, logRaw } = require('meteor/tools-core/lib/log');
beforeAll(() => { global.Plugin = { projectConfig: require('../../tool-extensions/project-config.cjs') }; });
afterAll(() => { delete global.Plugin; });

let appDir;
beforeEach(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-build-process-'));
  isMeteorAppConfigModernVerbose.mockReturnValue(true);
  logError.mockClear();
  logRaw.mockClear();
});
afterEach(() => { fs.rmSync(appDir, { recursive: true, force: true }); });
function executable(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (process.platform === 'win32') {
    const script = file + '.js';
    fs.writeFileSync(script, body);
    fs.writeFileSync(file.endsWith('.bat') ? file : file + '.cmd', `@"${process.execPath}" "${script}" %*\r\n`);
  } else {
    fs.writeFileSync(file, '#!' + process.execPath + '\n' + body, { mode: 0o755 });
  }
}

test('native builder exit status reaches the package and split signing output is redacted', async () => {
  executable(path.join(appDir, 'node_modules/.bin/cap'), "process.stdout.write('credential: private-'); setTimeout(() => { process.stdout.write('test-value\\n'); process.exit(29); }, 10);");
  expect(await runCapBuild({ appDir, request: { platform: 'android', args: ['build', 'android'], secrets: ['private-test-value'] } })).toBe(29);
  expect(logRaw.mock.calls.flat().join('\n')).toContain('[redacted]');
  expect(logRaw.mock.calls.flat().join('\n')).not.toContain('private-test-value');
});

test('a missing native builder rejects instead of leaving Meteor waiting', async () => {
  await expect(runCapBuild({ appDir, request: { platform: 'ios', args: ['build', 'ios'] } })).rejects.toMatchObject({ code: 'ENOENT' });
});

test('platform creation checks the configured directory even when the default directory exists', async () => {
  const project = path.join(appDir, 'native/ios');
  fs.mkdirSync(path.join(appDir, 'ios'));
  fs.writeFileSync(path.join(appDir, 'capacitor.config.js'),
    "module.exports = { ios: { path: 'native/' + process.env.METEOR_CAPACITOR_PLATFORM } };");
  executable(path.join(appDir, 'node_modules/.bin/cap'), "require('fs').mkdirSync('native/ios', { recursive: true });");
  expect(await addNativePlatformIfMissing({ appDir, platform: 'ios' })).toBe(0);
  expect(fs.statSync(project).isDirectory()).toBe(true);
  executable(path.join(appDir, 'node_modules/.bin/cap'), "process.exit(23);");
  expect(await addNativePlatformIfMissing({ appDir, platform: 'ios' })).toBe(0);
});

test.each([
  ['add', addNativePlatformIfMissing],
  ['sync', runCapSync],
])('cap %s reports discovered Cordova plugins during a normal run', async (_command, run) => {
  isMeteorAppConfigModernVerbose.mockReturnValue(false);
  executable(path.join(appDir, 'node_modules/.bin/cap'), `
    process.stdout.write('[info] Found 1 Cordova plugin for \\x1b[1mios\\x1b[0m:\\n       cordova-plugin-');
    process.stderr.write('[warn] Plugin requires additional native setup');
    setTimeout(() => process.stdout.write('purchases@8.0.0'), 10);
  `);
  expect(await run({ appDir, platform: 'ios' })).toBe(0);
  expect(logRaw.mock.calls.flat().join('\n')).toContain('cordova-plugin-purchases@8.0.0');
  expect(logError.mock.calls.flat().join('\n')).toContain('[warn] Plugin requires additional native setup');
});

test('Android debug runs the application Gradle wrapper with its selected task', async () => {
  const nativeDir = path.join(appDir, 'mobile/android');
  executable(path.join(nativeDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), "require('fs').writeFileSync('task.json', JSON.stringify({ args: process.argv.slice(2), platform: process.env.METEOR_CAPACITOR_PLATFORM }));");
  const request = { platform: 'android', nativeDir, gradleTask: 'assembleDemoDebug' };
  expect(await runCapBuild({ appDir, request })).toBe(0);
  expect(JSON.parse(fs.readFileSync(path.join(nativeDir, 'task.json')))).toEqual({ args: ['assembleDemoDebug'], platform: 'android' });
});
