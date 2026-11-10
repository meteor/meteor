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
      expect.arrayContaining(['@capacitor/cli@7.4.3', '@meteorjs/capacitor@0.2.0-alpha.1']),
      expect.objectContaining({ dev: true, includeDev: true, packageManager: 'npm' }),
    );
    expect(installNpmDependency).toHaveBeenCalledWith(
      expect.arrayContaining(['@capacitor/core@7.4.3', '@capacitor/android@7.4.3']),
      expect.objectContaining({ dev: false, includeDev: true, packageManager: 'npm' }),
    );
  });

  test('checking Android does not suppress a later iOS dependency check', async () => {
    await ensureCapacitorInstalled({ platforms: ['android'] });
    const ios = await ensureCapacitorInstalled({ platforms: ['ios'] });
    expect(ios.mode).toBe('manual-warning');
    expect(ios.installCommands.join('\n')).toContain('@capacitor/ios');
    expect(ios.installCommands.join('\n')).not.toContain('@capacitor/android');
    expect((await ensureCapacitorInstalled({ platforms: ['ios'] })).mode).toBe('noop');
  });

  test('requires runtime declarations and usable installed versions, including local links', () => {
    const dependencies = getCapacitorDependenciesForPlatforms(['android']);
    const manifest = { dependencies: {}, devDependencies: {} };
    for (const dep of dependencies) {
      const version = dep.version.replace(/^\^/, '');
      manifest[dep.dev ? 'devDependencies' : 'dependencies'][dep.name] = `^${version}`;
      installFixture(dep.name, version);
    }
    // A runtime package put in devDependencies disappears from production installs.
    manifest.devDependencies['@capacitor/android'] = manifest.dependencies['@capacitor/android'];
    delete manifest.dependencies['@capacitor/android'];
    // A newer install must not hide a declaration that permits an unsupported major.
    manifest.dependencies['@capacitor/core'] = '^6.0.0';
    // A declaration alone cannot make the native CLI executable.
    fs.rmSync(path.join(appDir, 'node_modules/@capacitor/cli'), { recursive: true });
    // Local development links still need to meet the runtime version floor.
    manifest.devDependencies['@meteorjs/capacitor'] = 'file:../meteor-capacitor';
    installFixture('@meteorjs/capacitor', '0.1.0');
    writeManifest(manifest);
    const statuses = Object.fromEntries(detectMissingOrOutdatedDeps(dependencies).map(dep => [dep.name, dep.status]));
    expect(statuses).toEqual({
      '@capacitor/core': 'outdated',
      '@capacitor/cli': 'missing',
      '@meteorjs/capacitor': 'outdated',
      '@capacitor/android': 'missing',
    });
  });

  test('accepts a correctly declared runtime hoisted to the workspace node_modules', () => {
    installFixture('@capacitor/core', '7.4.3');
    const nestedApp = path.join(appDir, 'apps', 'native');
    fs.mkdirSync(nestedApp, { recursive: true });
    fs.writeFileSync(path.join(nestedApp, 'package.json'), JSON.stringify({ dependencies: { '@capacitor/core': '^7.4.3' } }));
    const dependency = getCapacitorDependenciesForPlatforms([]).filter(dep => dep.name === '@capacitor/core');
    expect(detectMissingOrOutdatedDeps(dependency, { cwd: nestedApp })[0].status).toBe('ok');
  });
});
