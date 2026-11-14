const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('meteor/tools-core/lib/log', () => ({ logError: jest.fn(), logRaw: jest.fn(), logInfo() {}, logProgress() {}, logSuccess() {} }), { virtual: true });
jest.mock('meteor/tools-core/lib/process', () => require('../../../packages/tools-core/lib/process'), { virtual: true });
jest.mock('meteor/tools-core/lib/global-state', () => require('../../../packages/tools-core/lib/global-state'), { virtual: true });
jest.mock('meteor/tools-core/lib/readiness', () => require('../../../packages/tools-core/lib/readiness'), { virtual: true });
jest.mock('meteor/tools-core/lib/npm', () => ({ getNodeBinEnv: () => ({}), getNpxCommand: args => ({ command: '/missing/native-builder', args }) }), { virtual: true });
jest.mock('meteor/tools-core/lib/meteor', () => ({
  getMeteorAppDir: () => process.cwd(), inheritMeteorToolNodeFlags: env => env,
  isMeteorAppDevelopment: () => false, isMeteorAppProduction: () => true,
  isMeteorAppDebug: () => false, isMeteorAppConfigModernVerbose: () => true,
  isMeteorAppRun: () => false, isMeteorAppBuild: () => true,
  isMeteorAppNativeAndroid: () => false, isMeteorAppNativeIos: () => false,
}), { virtual: true });
const { runCapBuild } = require('../../../packages/capacitor/lib/processes');
const { logRaw } = require('meteor/tools-core/lib/log');
let appDir;
beforeEach(() => { appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-build-process-')); logRaw.mockClear(); });
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

test('Android debug runs the application Gradle wrapper with its selected task', async () => {
  const nativeDir = path.join(appDir, 'mobile/android');
  executable(path.join(nativeDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), "require('fs').writeFileSync('task.json', JSON.stringify({ args: process.argv.slice(2), platform: process.env.METEOR_CAPACITOR_PLATFORM }));");
  const request = { platform: 'android', nativeDir, gradleTask: 'assembleDemoDebug' };
  expect(await runCapBuild({ appDir, request })).toBe(0);
  expect(JSON.parse(fs.readFileSync(path.join(nativeDir, 'task.json')))).toEqual({ args: ['assembleDemoDebug'], platform: 'android' });
});
