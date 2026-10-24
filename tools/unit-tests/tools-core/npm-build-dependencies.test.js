const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installNpmDependency } = require('../../../packages/tools-core/lib/npm');

describe('npm automatic build dependencies in production', () => {
  let originalEnv;
  let originalPlugin;
  let originalPackage;
  let tempDir;
  let appDir;

  beforeEach(() => {
    originalEnv = process.env;
    originalPlugin = global.Plugin;
    originalPackage = global.Package;
    global.Package = { meteor: { global: {} } };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-build-deps-'));
    process.env = { ...originalEnv };
    // Neither parent npm scripts nor user/global npmrc files may redirect or
    // change these offline fixture installs.
    for (const name of Object.keys(process.env)) {
      if (/^npm_config_/i.test(name)) delete process.env[name];
    }
    const userConfig = path.join(tempDir, 'user.npmrc');
    const globalConfig = path.join(tempDir, 'global.npmrc');
    fs.writeFileSync(userConfig, '');
    fs.writeFileSync(globalConfig, '');
    Object.assign(process.env, {
      NODE_ENV: 'production',
      YARN_ENABLED: 'false',
      npm_config_offline: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_global: 'false',
      npm_config_location: 'project',
      npm_config_userconfig: userConfig,
      npm_config_globalconfig: globalConfig,
      npm_config_cache: path.join(tempDir, 'cache'),
    });
    global.Plugin = { getCurrentNodeBinDir: () => path.dirname(process.execPath) };
    appDir = createPackage('app');
  });

  afterEach(() => {
    process.env = originalEnv;
    if (originalPlugin === undefined) delete global.Plugin;
    else global.Plugin = originalPlugin;
    if (originalPackage === undefined) delete global.Package;
    else global.Package = originalPackage;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createPackage(name) {
    const directory = path.join(tempDir, name);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
      name, version: '1.0.0', private: true,
    }));
    return directory;
  }

  function isInstalled(name) {
    return fs.existsSync(path.join(appDir, 'node_modules', name, 'package.json'));
  }

  test('preserves npm production defaults unless build dependencies are requested', async () => {
    const tool = createPackage('fixture-build-tool');
    expect(await installNpmDependency(tool, {
      cwd: appDir, dev: true,
    })).toBe(true);
    expect(isInstalled('fixture-build-tool')).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json')));
    expect(manifest.devDependencies['fixture-build-tool']).toBeDefined();
    expect(manifest.dependencies).toBeUndefined();
    expect(process.env.NODE_ENV).toBe('production');
  });

  test.each([false, true])('auto-installs build tools with runtime bucket=%s', async (withRuntime) => {
    const { ensurePackageDependencies } = require('../../../packages/tools-core/lib/deps');
    const tool = createPackage('fixture-build-tool');
    const dependencies = [{ name: 'fixture-build-tool', version: `file:${tool}`, dev: true }];
    if (withRuntime) {
      const runtime = createPackage('fixture-runtime');
      dependencies.push({ name: 'fixture-runtime', version: `file:${runtime}`, dev: false });
    }
    const result = await ensurePackageDependencies({
      packageId: 'fixture-build', packageLabel: 'Fixture build',
      cwd: appDir, dependencies,
    });
    expect(result.mode).toBe('auto-install');
    expect(result.installed).toBe(true);
    expect(isInstalled('fixture-build-tool')).toBe(true);
    expect(isInstalled('fixture-runtime')).toBe(withRuntime);
    const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json')));
    expect(manifest.devDependencies['fixture-build-tool']).toBeDefined();
    if (withRuntime) expect(manifest.dependencies['fixture-runtime']).toBeDefined();
    else expect(manifest.dependencies).toBeUndefined();
    expect(process.env.NODE_ENV).toBe('production');
  });
});
