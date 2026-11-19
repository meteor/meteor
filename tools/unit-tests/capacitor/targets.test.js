const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  function execFile(command, args, options, callback) {
    if (/[\\/]adb(?:\.exe)?$/.test(command)) {
      callback(null, args.includes('emu') ? 'test_avd\nOK\n' : process.env.TEST_ADB, '');
    } else if (command === 'xcrun') {
      callback(null, process.env.TEST_SIMULATORS, '');
    } else return actual.execFile(command, args, options, callback);
  }
  execFile[require('util').promisify.custom] = (command, args, options) => new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
  return { ...actual, execFile };
});
jest.mock('meteor/tools-core/lib/log', () => ({ logError() {}, logRaw() {}, logInfo() {}, logProgress() {}, logSuccess() {} }), { virtual: true });
jest.mock('meteor/tools-core/lib/process', () => require('../../../packages/tools-core/lib/process'), { virtual: true });
jest.mock('meteor/tools-core/lib/global-state', () => require('../../../packages/tools-core/lib/global-state'), { virtual: true });
jest.mock('meteor/tools-core/lib/readiness', () => require('../../../packages/tools-core/lib/readiness'), { virtual: true });
jest.mock('meteor/tools-core/lib/npm', () => ({ getNodeBinEnv: () => ({}), getNpxCommand: () => { throw new Error('Expected app-local Capacitor'); } }), { virtual: true });
jest.mock('meteor/tools-core/lib/meteor', () => ({
  getMeteorAppDir: () => process.cwd(), inheritMeteorToolNodeFlags: env => env,
  isMeteorAppDevelopment: () => true, isMeteorAppProduction: () => false,
  isMeteorAppDebug: () => false, isMeteorAppConfigModernVerbose: () => false,
  isMeteorAppRun: () => true, isMeteorAppBuild: () => false,
  isMeteorAppNativeAndroid: () => false, isMeteorAppNativeIos: () => false,
}), { virtual: true });
const { resolveCapTarget, listCapTargets } = require('../../../packages/capacitor/lib/processes');
let appDir;
let originalEnv;
let ttyDescriptors;

function executable(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (process.platform === 'win32') {
    fs.writeFileSync(file + '.js', body);
    fs.writeFileSync(file + '.cmd', `@"${process.execPath}" "${file}.js" %*\r\n`);
  } else fs.writeFileSync(file, '#!' + process.execPath + '\n' + body, { mode: 0o755 });
}

beforeEach(() => {
  originalEnv = { ...process.env };
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capacitor-targets-'));
  for (const key of Object.keys(process.env)) if (key.startsWith('METEOR_CAPACITOR_')) delete process.env[key];
  process.env.CI = 'true';
  process.env.ANDROID_HOME = appDir;
  process.env.PATH = appDir + path.delimiter + process.env.PATH;
  process.env.TEST_TARGETS = JSON.stringify([{ id: 'phone', name: 'Phone' }, { id: 'test_avd', name: 'Test Emulator' }]);
  process.env.TEST_ADB = 'List of devices attached\nphone\tdevice\n';
  process.env.TEST_SIMULATORS = JSON.stringify({ devices: {} });
  ttyDescriptors = [process.stdin, process.stdout].map(stream => Object.getOwnPropertyDescriptor(stream, 'isTTY'));
  executable(path.join(appDir, 'node_modules/.bin/cap'), 'process.stdout.write(process.env.TEST_TARGETS); process.exit(Number(process.env.TEST_CAP_EXIT || 0));');
});

afterEach(() => {
  process.env = originalEnv;
  [process.stdin, process.stdout].forEach((stream, index) => {
    if (ttyDescriptors[index]) Object.defineProperty(stream, 'isTTY', ttyDescriptors[index]);
    else delete stream.isTTY;
  });
  fs.rmSync(appDir, { recursive: true, force: true });
});

test('an explicit target bypasses discovery even when the target is not online', async () => {
  process.env.METEOR_CAPACITOR_TARGET = 'chosen-simulator';
  process.env.TEST_TARGETS = 'invalid JSON';
  expect(await resolveCapTarget({ appDir, platform: 'ios' })).toBe('chosen-simulator');
});

test('existing named targets and list requests bypass automatic selection', async () => {
  process.env.TEST_TARGETS = 'invalid JSON';
  process.env.METEOR_CAPACITOR_TARGET_NAME = 'Chosen phone';
  expect(await resolveCapTarget({ appDir, platform: 'android' })).toBe(null);
  delete process.env.METEOR_CAPACITOR_TARGET_NAME;
  process.env.METEOR_CAPACITOR_LIST = 'true';
  expect(await resolveCapTarget({ appDir, platform: 'android' })).toBe(null);
});

test('explicit run arguments retain precedence over environment targets', async () => {
  process.env.METEOR_CAPACITOR_TARGET = 'env-target';
  process.env.TEST_TARGETS = 'invalid JSON';
  expect(await resolveCapTarget({ appDir, platform: 'ios', extraArgs: ['--target=chosen-target'] })).toBe(null);
});

test('selects the only online Android device and ignores offline and unauthorized devices', async () => {
  process.env.TEST_TARGETS = JSON.stringify([{ id: 'offline' }, { id: 'unauthorized' }, { id: 'phone' }, { id: 'test_avd' }]);
  process.env.TEST_ADB += 'offline\toffline\nunauthorized\tunauthorized\n';
  expect(await resolveCapTarget({ appDir, platform: 'android' })).toBe('phone');
});

test.each([
  [['test_avd', 'emulator-5554', 'emulator-5554'], 'emulator-5554'],
  [['test_avd'], 'test_avd'],
])('one running emulator is selected once from %j', async (ids, expected) => {
  process.env.TEST_TARGETS = JSON.stringify(ids.map(id => ({ id })));
  process.env.TEST_ADB = 'List of devices attached\nemulator-5554\tdevice\n';
  expect(await resolveCapTarget({ appDir, platform: 'android' })).toBe(expected);
});

test('selects a booted iOS simulator rather than the first available simulator', async () => {
  process.env.TEST_TARGETS = JSON.stringify([{ id: 'shutdown' }, { id: 'booted' }]);
  process.env.TEST_SIMULATORS = JSON.stringify({ devices: { runtime: [{ udid: 'shutdown', state: 'Shutdown' }, { udid: 'booted', state: 'Booted' }] } });
  expect(await resolveCapTarget({ appDir, platform: 'ios' })).toBe('booted');
});

test.each(['true', undefined])('CI rejects ambiguous online devices, including the old auto-pick setting %s', async autoPick => {
  if (autoPick) process.env.METEOR_CAPACITOR_AUTO_PICK_TARGET = autoPick;
  process.env.TEST_TARGETS = JSON.stringify([{ id: 'phone' }, { id: 'other-phone' }]);
  process.env.TEST_ADB += 'other-phone\tdevice\n';
  await expect(resolveCapTarget({ appDir, platform: 'android' })).rejects.toThrow(/METEOR_CAPACITOR_TARGET/);
});

test('interactive ambiguity leaves the prompt to Capacitor', async () => {
  delete process.env.CI;
  [process.stdin, process.stdout].forEach(stream => Object.defineProperty(stream, 'isTTY', { configurable: true, value: true }));
  process.env.TEST_TARGETS = JSON.stringify([{ id: 'phone' }, { id: 'other-phone' }]);
  process.env.TEST_ADB += 'other-phone\tdevice\n';
  expect(await resolveCapTarget({ appDir, platform: 'android' })).toBe(null);
});

test('headless mode never delegates ambiguity to a prompt even with a TTY', async () => {
  delete process.env.CI;
  process.env.METEOR_HEADLESS = 'true';
  [process.stdin, process.stdout].forEach(stream => Object.defineProperty(stream, 'isTTY', { configurable: true, value: true }));
  process.env.TEST_TARGETS = JSON.stringify([{ id: 'phone' }, { id: 'other-phone' }]);
  process.env.TEST_ADB += 'other-phone\tdevice\n';
  await expect(resolveCapTarget({ appDir, platform: 'android' })).rejects.toThrow(/METEOR_CAPACITOR_TARGET/);
});

test('CI reports unavailable devices instead of starting a target implicitly', async () => {
  process.env.TEST_ADB = 'List of devices attached\n';
  await expect(resolveCapTarget({ appDir, platform: 'android' })).rejects.toThrow(/No online.*METEOR_CAPACITOR_TARGET/);
});

test('target-list failures remain errors instead of becoming an empty selection', async () => {
  process.env.TEST_CAP_EXIT = '19';
  await expect(listCapTargets({ appDir, platform: 'android' })).rejects.toThrow(/19/);
  delete process.env.TEST_CAP_EXIT;
  process.env.TEST_TARGETS = 'invalid JSON';
  await expect(listCapTargets({ appDir, platform: 'android' })).rejects.toThrow(/target/i);
});
