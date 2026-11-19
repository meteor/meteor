const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('../../../packages/tools-core/lib/npm', () => ({
  ...jest.requireActual('../../../packages/tools-core/lib/npm'),
  installNpmDependency: jest.fn(async () => true),
}));
jest.mock('meteor/tools-core/lib/deps', () => require('../../../packages/tools-core/lib/deps'), { virtual: true });
jest.mock('meteor/tools-core/lib/npm', () => require('../../../packages/tools-core/lib/npm'), { virtual: true });
jest.mock('meteor/tools-core/lib/meteor', () => require('../../../packages/tools-core/lib/meteor'), { virtual: true });
jest.mock('meteor/tools-core/lib/global-state', () => require('../../../packages/tools-core/lib/global-state'), { virtual: true });
jest.mock('meteor/tools-core/lib/log', () => require('../../../packages/tools-core/lib/log'), { virtual: true });

const { installNpmDependency } = require('../../../packages/tools-core/lib/npm');
describe('Capacitor host dependencies', () => {
  let detectMissingOrOutdatedDeps;
  let ensureCapacitorInstalled;
  let getCapacitorDependenciesForPlatforms;
  let appDir;
  let previousCwd;
  let previousPackage;

  beforeEach(() => {
    previousCwd = process.cwd();
    previousPackage = global.Package;
    global.Package = { meteor: { Meteor: { isDebug: false }, global: { currentCommand: { name: 'run', options: {} } } } };
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-capacitor-deps-'));
    process.chdir(appDir);
    installNpmDependency.mockClear();
    writeManifest({ name: 'fixture', meteor: { autoInstallDeps: false } });
    ({ detectMissingOrOutdatedDeps } = require('../../../packages/tools-core/lib/deps'));
    ({ ensureCapacitorInstalled, getCapacitorDependenciesForPlatforms } = require('../../../packages/capacitor/lib/dependencies'));
  });

  afterEach(() => {
    process.chdir(previousCwd);
    if (previousPackage === undefined) delete global.Package;
    else global.Package = previousPackage;
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  function writeManifest(manifest) {
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(manifest));
  }

  function installFixture(name, version, directory = appDir) {
    const packageDir = path.join(directory, 'node_modules', name);
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name, version }));
  }

  test('manual mode provides scoped commands without installing or rewriting the app', async () => {
    const manifest = fs.readFileSync('package.json', 'utf8');
    const result = await ensureCapacitorInstalled({ platforms: ['android'] });
    expect(installNpmDependency).not.toHaveBeenCalled();
    expect(result.mode).toBe('manual-warning');
    expect(result.installCommands.join('\n')).toContain('@capacitor/android');
    expect(result.installCommands.join('\n')).not.toContain('@capacitor/ios');
    expect(fs.readFileSync('package.json', 'utf8')).toBe(manifest);
    expect(fs.existsSync('node_modules')).toBe(false);
  });

  test('update --npm overrides manual mode and includes build tools in both installation steps', async () => {
    global.Package.meteor.global.currentCommand = { name: 'update', options: { npm: true } };
    const result = await ensureCapacitorInstalled({ platforms: ['android'] });
    expect(result.installed).toBe(true);
    expect(installNpmDependency).toHaveBeenCalledWith(
      expect.arrayContaining(['@capacitor/cli@8.6.2', '@meteorjs/capacitor@0.2.0-alpha.1']),
      expect.objectContaining({ dev: true, includeDev: true, packageManager: 'npm' }),
    );
    expect(installNpmDependency).toHaveBeenCalledWith(
      expect.arrayContaining(['@capacitor/core@8.6.2', '@capacitor/android@8.6.2']),
      expect.objectContaining({ dev: false, includeDev: true, packageManager: 'npm' }),
    );
  });

  test('new apps install the supported baseline with automatic installation enabled by default', async () => {
    writeManifest({ name: 'fixture' });
    const result = await ensureCapacitorInstalled({ platforms: ['android'] });
    expect(result.mode).toBe('auto-install');
    expect(installNpmDependency).toHaveBeenCalledWith(
      expect.arrayContaining(['@capacitor/core@8.6.2', '@capacitor/android@8.6.2']),
      expect.objectContaining({ dev: false, includeDev: true }),
    );
  });

  test('manual mode reports older installed Capacitor 8 packages without rewriting the app', async () => {
    const manifest = { meteor: { autoInstallDeps: false }, dependencies: {}, devDependencies: {} };
    for (const dep of getCapacitorDependenciesForPlatforms(['android'])) {
      const version = dep.name.startsWith('@capacitor/') ? '8.0.0' : dep.version;
      manifest[dep.dev ? 'devDependencies' : 'dependencies'][dep.name] = `^${version}`;
      installFixture(dep.name, version);
    }
    writeManifest(manifest);
    const before = fs.readFileSync('package.json', 'utf8');
    const result = await ensureCapacitorInstalled({ platforms: ['android'] });
    expect(result.mode).toBe('manual-warning');
    expect(result.installCommands.join('\n')).toContain('@capacitor/core@8.6.2');
    expect(result.installCommands.join('\n')).toContain('@capacitor/cli@8.6.2');
    expect(result.installCommands.join('\n')).toContain('@capacitor/android@8.6.2');
    expect(installNpmDependency).not.toHaveBeenCalled();
    expect(fs.readFileSync('package.json', 'utf8')).toBe(before);
  });

  test('checking Android does not suppress a later iOS dependency check', async () => {
    await ensureCapacitorInstalled({ platforms: ['android'] });
    const ios = await ensureCapacitorInstalled({ platforms: ['ios'] });
    expect(ios.mode).toBe('manual-warning');
    expect(ios.installCommands.join('\n')).toContain('@capacitor/ios');
    expect(ios.installCommands.join('\n')).not.toContain('@capacitor/android');
    expect((await ensureCapacitorInstalled({ platforms: ['ios'] })).mode).toBe('noop');
  });

  test('accepts native tooling in devDependencies while requiring installed tools and valid local runtime links', () => {
    const dependencies = getCapacitorDependenciesForPlatforms(['android']);
    const manifest = { dependencies: {}, devDependencies: {} };
    for (const dep of dependencies) {
      const version = dep.version.replace(/^\^/, '');
      manifest[dep.dev ? 'devDependencies' : 'dependencies'][dep.name] = `^${version}`;
      installFixture(dep.name, version);
    }
    manifest.devDependencies['@capacitor/android'] = manifest.dependencies['@capacitor/android'];
    delete manifest.dependencies['@capacitor/android'];
    // A declaration alone cannot make the native CLI executable.
    fs.rmSync(path.join(appDir, 'node_modules/@capacitor/cli'), { recursive: true });
    // Local development links still need to meet the runtime version floor.
    manifest.devDependencies['@meteorjs/capacitor'] = 'file:../meteor-capacitor';
    installFixture('@meteorjs/capacitor', '0.1.0');
    writeManifest(manifest);
    const statuses = Object.fromEntries(detectMissingOrOutdatedDeps(dependencies).map(dep => [dep.name, dep.status]));
    expect(statuses).toEqual({
      '@capacitor/core': 'ok',
      '@capacitor/cli': 'missing',
      '@meteorjs/capacitor': 'outdated',
      '@capacitor/android': 'ok',
    });
  });

  test('accepts a correctly declared runtime hoisted to the workspace node_modules', () => {
    installFixture('@capacitor/core', '8.6.2');
    const nestedApp = path.join(appDir, 'apps', 'native');
    fs.mkdirSync(nestedApp, { recursive: true });
    fs.writeFileSync(path.join(nestedApp, 'package.json'), JSON.stringify({ dependencies: { '@capacitor/core': '^8.6.2' } }));
    const dependency = getCapacitorDependenciesForPlatforms([]).filter(dep => dep.name === '@capacitor/core');
    expect(detectMissingOrOutdatedDeps(dependency, { cwd: nestedApp })[0].status).toBe('ok');
  });

  test.each(['^7.6.7', '>=8.0.0', '^8.0.0 || ^9.0.0', '^9.0.0'])(
    'rejects unsupported declarations (%s) before installing missing dependencies', async version => {
      writeManifest({ dependencies: { '@capacitor/core': version } });
      installFixture('@capacitor/core', '8.6.2');
      const before = fs.readFileSync('package.json', 'utf8');
      await expect(ensureCapacitorInstalled({ platforms: ['android'] })).rejects.toThrow(/Capacitor 8 only/);
      expect(installNpmDependency).not.toHaveBeenCalled();
      expect(fs.readFileSync('package.json', 'utf8')).toBe(before);
    },
  );

  test('rejects an installed mixed-major stack before auto-installing anything', async () => {
    writeManifest({ dependencies: { '@capacitor/core': '^8.0.0', '@capacitor/android': '^8.0.0' } });
    installFixture('@capacitor/core', '8.6.2');
    installFixture('@capacitor/android', '7.6.7');
    await expect(ensureCapacitorInstalled({ platforms: ['android'] })).rejects.toThrow(/@capacitor\/android has installed version 7/);
    expect(installNpmDependency).not.toHaveBeenCalled();
  });

  test('checks plugin core peers without assuming the plugin major matches Capacitor', async () => {
    writeManifest({ dependencies: { '@capacitor/core': '^8.0.0', 'scanner-plugin': '^3.0.0' } });
    installFixture('@capacitor/core', '8.0.0');
    installFixture('scanner-plugin', '3.0.0');
    const pluginPath = path.join(appDir, 'node_modules/scanner-plugin/package.json');
    fs.writeFileSync(pluginPath, JSON.stringify({ version: '3.0.0', peerDependencies: { '@capacitor/core': '^7.0.0' } }));
    await expect(ensureCapacitorInstalled({ platforms: ['android'] })).rejects.toThrow(/scanner-plugin requires @capacitor\/core/);
    expect(installNpmDependency).not.toHaveBeenCalled();
    fs.writeFileSync(pluginPath, JSON.stringify({ version: '3.0.0', peerDependencies: { '@capacitor/core': '^8.6.2' } }));
    expect((await ensureCapacitorInstalled({ platforms: ['android'] })).installed).toBe(true);
  });

  test('preserves newer compatible Capacitor 8 installs and bounded ranges in devDependencies', async () => {
    const dependencies = getCapacitorDependenciesForPlatforms(['android']);
    const manifest = { devDependencies: {} };
    for (const dep of dependencies) {
      const version = dep.name.startsWith('@capacitor/') ? '8.7.0' : dep.version;
      manifest.devDependencies[dep.name] = dep.name.startsWith('@capacitor/') ? '>=8.7.0 <9.0.0' : `^${version}`;
      installFixture(dep.name, version);
    }
    writeManifest(manifest);
    const before = fs.readFileSync('package.json', 'utf8');
    expect((await ensureCapacitorInstalled({ platforms: ['android'] })).mode).toBe('noop');
    expect(installNpmDependency).not.toHaveBeenCalled();
    expect(fs.readFileSync('package.json', 'utf8')).toBe(before);
  });

  test.each([true, false])('raises older Capacitor 8 declarations and installations to the supported minimum (installed: %s)', async installed => {
    writeManifest({ dependencies: { '@capacitor/core': '8.0.0' }, devDependencies: { '@capacitor/cli': '~8.1.0' } });
    if (installed) installFixture('@capacitor/core', '8.0.0');
    await ensureCapacitorInstalled({ platforms: ['android'] });
    expect(installNpmDependency).toHaveBeenCalledWith(
      expect.arrayContaining(['@capacitor/core@8.6.2', '@capacitor/android@8.6.2']),
      expect.objectContaining({ dev: false }),
    );
    expect(installNpmDependency).toHaveBeenCalledWith(
      expect.arrayContaining(['@capacitor/cli@8.6.2']),
      expect.objectContaining({ dev: true }),
    );
    expect(installNpmDependency.mock.calls.flatMap(([packages]) => packages)).not.toContain('@capacitor/core@8.0.0');
  });
});
