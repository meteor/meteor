const fs = require('fs');
const os = require('os');
const path = require('path');
const { withSwcNativeCache } = require('../../../packages/rspack/lib/swc-cache');

const describeLinux = process.platform === 'linux' ? describe : describe.skip;

describeLinux('Rspack SWC native cache environment', () => {
  let directory;
  let accountHome;
  let mountedHome;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-swc-cache-test-'));
    accountHome = path.join(directory, 'account');
    mountedHome = path.join(directory, 'mounted');
    fs.mkdirSync(accountHome, { mode: 0o700 });
    fs.mkdirSync(mountedHome, { mode: 0o700 });
    jest.spyOn(os, 'userInfo').mockReturnValue({ homedir: accountHome });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('preserves working HOME and XDG caches without setting an override', () => {
    const homeEnv = { HOME: mountedHome };
    const xdgEnv = { HOME: mountedHome, XDG_CACHE_HOME: path.join(directory, 'xdg') };
    expect(withSwcNativeCache(homeEnv)).toBe(homeEnv);
    expect(withSwcNativeCache(xdgEnv)).toBe(xdgEnv);
  });

  test('uses the account home when a mounted home belongs to another user', () => {
    const lstatSync = fs.lstatSync;
    jest.spyOn(fs, 'lstatSync').mockImplementation(file => {
      const stat = lstatSync(file);
      if (file === mountedHome) stat.uid = process.geteuid() + 1;
      return stat;
    });
    const env = { HOME: mountedHome, METEOR_ENV: 'preserved' };

    expect(withSwcNativeCache(env)).toEqual({
      ...env,
      SWC_NATIVE_BINDING_CACHE: path.join(accountHome, '.cache'),
    });
    expect(env.SWC_NATIVE_BINDING_CACHE).toBeUndefined();
    expect(fs.existsSync(path.join(accountHome, '.cache'))).toBe(false);
  });

  test('checks permissions on ancestors of a missing XDG cache', () => {
    fs.chmodSync(mountedHome, 0o777);
    const env = { HOME: accountHome, XDG_CACHE_HOME: path.join(mountedHome, 'new', 'cache') };
    expect(withSwcNativeCache(env).SWC_NATIVE_BINDING_CACHE).toBe(path.join(accountHome, '.cache'));
  });

  test.each(['', '0', '/explicit/swc-cache'])('preserves explicit SWC cache setting %j', value => {
    fs.chmodSync(mountedHome, 0o777);
    const env = { HOME: mountedHome, SWC_NATIVE_BINDING_CACHE: value };
    expect(withSwcNativeCache(env)).toBe(env);
  });

  test('does not select an account cache with incompatible permissions', () => {
    fs.chmodSync(mountedHome, 0o777);
    fs.chmodSync(accountHome, 0o777);
    const env = { HOME: mountedHome };
    expect(withSwcNativeCache(env)).toBe(env);
  });
});
