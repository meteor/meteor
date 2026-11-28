const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveNativeProjectDirs } = require('./native-project-dirs');

const extension = {
  id: 'mobile',
  nativeProjectConfig: { file: 'mobile.config', paths: { ios: ['ios', 'path'] } },
  platforms: [{ name: 'ios', nativeProjectDir: 'ios' }, { name: 'android', nativeProjectDir: 'android' }],
};
const getPlatformEnv = () => ({});
let appDir;
beforeEach(() => { appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-project-dirs-')); });
afterEach(() => { fs.rmSync(appDir, { recursive: true, force: true }); });

test('a missing native-only dependency leaves the default directories available to web development', async () => {
  fs.writeFileSync(path.join(appDir, 'mobile.config.js'), "require('unavailable-native-only-module');");
  const warn = jest.fn();
  expect(await resolveNativeProjectDirs([extension], appDir, getPlatformEnv, warn)).toEqual([
    path.join(appDir, 'ios'), path.join(appDir, 'android'),
  ]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('mobile.config.js'));
});

test.each(['.', '..'])('a native project at %s keeps changes in the app observable', async dir => {
  fs.writeFileSync(path.join(appDir, 'mobile.config.json'), JSON.stringify({ ios: { path: dir } }));
  expect(await resolveNativeProjectDirs([extension], appDir, getPlatformEnv, jest.fn())).toEqual([path.join(appDir, 'android')]);
});

test('a config and its imports see each target independently of the running tool', async () => {
  const settings = {
    file: 'mobile.config',
    platformEnv: 'MOBILE_TEST_PLATFORM',
    paths: { ios: ['project'], android: ['project'] },
  };
  const targets = { ...extension, nativeProjectConfig: settings };
  const original = process.env.MOBILE_TEST_PLATFORM;
  fs.writeFileSync(path.join(appDir, 'platform.mjs'), 'export default process.env.MOBILE_TEST_PLATFORM;');
  fs.writeFileSync(path.join(appDir, 'mobile.config.mjs'),
    "import platform from './platform.mjs'; export default { project: 'native/' + platform };");
  expect(await resolveNativeProjectDirs([targets], appDir, getPlatformEnv, jest.fn())).toEqual([
    path.join(appDir, 'native/ios'), path.join(appDir, 'native/android'),
  ]);
  expect(process.env.MOBILE_TEST_PLATFORM).toBe(original);
});
