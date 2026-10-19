const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

describe('optional app dependencies with a linked meteor-rspack', () => {
  let tempDir;
  let appDir;
  let packageDir;
  const pluginName = '@fixture/refresh-plugin';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-optional-dependency-'));
    appDir = path.join(tempDir, 'app');
    packageDir = path.join(tempDir, 'meteor-rspack');
    fs.mkdirSync(path.join(appDir, 'node_modules', '@meteorjs'), { recursive: true });
    fs.mkdirSync(packageDir);
    fs.copyFileSync(
      path.join(__dirname, 'optionalDependency.js'),
      path.join(packageDir, 'index.js'),
    );
    fs.symlinkSync(
      packageDir,
      path.join(appDir, 'node_modules', '@meteorjs', 'rspack'),
      'junction',
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function installPlugin(directory, source) {
    const pluginDir = path.join(directory, 'node_modules', pluginName);
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'index.js'), source);
  }

  function loadPlugin() {
    // Use Node's actual symlink/module resolution, outside Jest's resolver.
    return JSON.parse(execFileSync(process.execPath, ['-e', `
      const { loadOptionalDependency } = require('@meteorjs/rspack');
      try {
        console.log(JSON.stringify({
          value: loadOptionalDependency(${JSON.stringify(pluginName)}, process.cwd()),
        }));
      } catch (error) {
        console.log(JSON.stringify({ error: { code: error.code, message: error.message } }));
      }
    `], { cwd: appDir, encoding: 'utf8' }));
  }

  test('loads the app plugin and prefers it over the linked package copy', () => {
    installPlugin(appDir, "module.exports = 'app plugin';");
    expect(loadPlugin()).toEqual({ value: 'app plugin' });

    installPlugin(packageDir, "module.exports = 'package plugin';");
    expect(loadPlugin()).toEqual({ value: 'app plugin' });
  });

  test('falls back to a plugin installed with the linked package', () => {
    installPlugin(packageDir, "module.exports = 'package plugin';");
    expect(loadPlugin()).toEqual({ value: 'package plugin' });
  });

  test('allows an optional plugin to be absent', () => {
    expect(loadPlugin()).toEqual({ value: null });
  });

  test.each(['main', 'exports'])('surfaces a missing plugin entry declared by %s', field => {
    const pluginDir = path.join(appDir, 'node_modules', pluginName);
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({
      name: pluginName,
      [field]: './missing-entry.js',
    }));
    installPlugin(packageDir, "module.exports = 'package plugin';");

    expect(loadPlugin()).toEqual({
      error: {
        code: 'MODULE_NOT_FOUND',
        message: expect.stringContaining('missing-entry.js'),
      },
    });
  });

  test('surfaces a missing dependency inside an installed plugin', () => {
    installPlugin(appDir, "require('missing-refresh-plugin-dependency');");
    installPlugin(packageDir, "module.exports = 'package plugin';");

    expect(loadPlugin()).toEqual({
      error: {
        code: 'MODULE_NOT_FOUND',
        message: expect.stringContaining("Cannot find module 'missing-refresh-plugin-dependency'"),
      },
    });
  });
});
