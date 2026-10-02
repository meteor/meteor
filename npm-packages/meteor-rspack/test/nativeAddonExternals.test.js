const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createNativeAddonExternals,
  getPackageName,
  isNativeAddonPackage,
  shouldForceBundle,
  toBareSpecifier,
} = require('../lib/nativeAddonExternals.js');

function addPackage(base, name, packageJson = {}, files = []) {
  const packageDir = path.join(base, 'node_modules', ...name.split('/'));
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...packageJson })
  );
  for (const file of files) {
    const filePath = path.join(packageDir, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'fixture');
  }
  return packageDir;
}

function invoke(external, context, request) {
  return new Promise((resolve, reject) => {
    external({ context, request }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

test('parses scoped and unscoped package requests', () => {
  assert.equal(getPackageName('plain/subpath'), 'plain');
  assert.equal(getPackageName('@scope/pkg/subpath'), '@scope/pkg');
  assert.equal(getPackageName('@scope'), null);
});

test('detects installed native evidence without header-only false positives', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rspack-native-detect-'));
  try {
    const nativeBinary = addPackage(root, 'native-binary', {}, [
      'prebuilds/linux-x64/addon.node',
    ]);
    const bindingGyp = addPackage(root, 'binding-gyp', {}, ['binding.gyp']);
    const runtimeLoader = addPackage(root, 'runtime-loader', {
      optionalDependencies: { 'node-gyp-build': '^4.0.0' },
    });
    const headerOnly = addPackage(root, 'header-only', {
      dependencies: { 'node-addon-api': '^8.0.0', nan: '^2.0.0' },
    });
    const emptyPrebuilds = addPackage(root, 'empty-prebuilds');
    fs.mkdirSync(path.join(emptyPrebuilds, 'prebuilds'));

    assert.equal(isNativeAddonPackage(nativeBinary), true);
    assert.equal(isNativeAddonPackage(bindingGyp), true);
    assert.equal(isNativeAddonPackage(runtimeLoader), true);
    assert.equal(isNativeAddonPackage(headerOnly), false);
    assert.equal(isNativeAddonPackage(emptyPrebuilds), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('externalizes package roots, subpaths, and direct node binaries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rspack-native-external-'));
  try {
    const appDir = path.join(root, 'app');
    const issuer = path.join(appDir, 'src', 'feature');
    fs.mkdirSync(issuer, { recursive: true });
    addPackage(appDir, '@scope/native', {}, [
      'build/Release/addon.node',
    ]);

    const external = createNativeAddonExternals();
    assert.equal(
      await invoke(external, issuer, '@scope/native'),
      'commonjs @scope/native'
    );
    assert.equal(
      await invoke(external, issuer, '@scope/native/subpath'),
      'commonjs @scope/native/subpath'
    );
    assert.equal(
      await invoke(
        external,
        path.join(appDir, 'node_modules', '@scope', 'native'),
        './build/Release/addon.node'
      ),
      'commonjs @scope/native/build/Release/addon.node'
    );
    assert.equal(
      await invoke(external, issuer, path.join(root, 'outside.node')),
      undefined
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('keeps native verdicts separate for nested package versions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rspack-native-nested-'));
  try {
    const appDir = path.join(root, 'app');
    const nestedDir = path.join(appDir, 'feature');
    addPackage(appDir, 'duplicate');
    addPackage(nestedDir, 'duplicate', {}, ['addon.node']);

    const external = createNativeAddonExternals();
    assert.equal(
      await invoke(external, path.join(nestedDir, 'src'), 'duplicate'),
      'commonjs duplicate'
    );
    assert.equal(
      await invoke(external, path.join(appDir, 'other'), 'duplicate'),
      undefined
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('lets users force detected packages and direct binaries through Rspack', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rspack-native-force-'));
  try {
    const appDir = path.join(root, 'app');
    const issuer = path.join(appDir, 'src');
    const packageDir = addPackage(appDir, '@scope/false-positive', {}, [
      'binding.gyp',
      'build/Release/addon.node',
    ]);

    const external = createNativeAddonExternals({
      forceBundle: ['@scope/false-positive'],
    });
    assert.equal(
      await invoke(external, issuer, '@scope/false-positive'),
      undefined
    );
    assert.equal(
      await invoke(external, issuer, '@scope/false-positive/pure-js'),
      undefined
    );
    assert.equal(
      await invoke(
        external,
        packageDir,
        './build/Release/addon.node'
      ),
      undefined
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('supports path, regular expression, and function forceBundle conditions', () => {
  const details = {
    request: 'native-package/subpath',
    packageName: 'native-package',
    packageDir: path.join('/app', 'node_modules', 'native-package'),
    resourcePath: path.join(
      '/app',
      'node_modules',
      'native-package',
      'subpath.js'
    ),
  };

  assert.equal(shouldForceBundle(['native-package'], details), true);
  assert.equal(
    shouldForceBundle([/node_modules[\\/]native-package/], details),
    true
  );
  assert.equal(
    shouldForceBundle([(resource) => resource.endsWith('subpath.js')], details),
    true
  );
  assert.equal(shouldForceBundle(['different-package'], details), false);
});

test('can disable automatic native addon externalization', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rspack-native-disable-'));
  try {
    const appDir = path.join(root, 'app');
    addPackage(appDir, 'native-package', {}, ['binding.gyp']);

    const external = createNativeAddonExternals({ enabled: false });
    assert.equal(
      await invoke(external, path.join(appDir, 'src'), 'native-package'),
      undefined
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('converts POSIX and Windows node_modules paths to bare specifiers', () => {
  assert.equal(
    toBareSpecifier('/app/node_modules/@scope/pkg/addon.node'),
    '@scope/pkg/addon.node'
  );
  assert.equal(
    toBareSpecifier('C:\\app\\node_modules\\pkg\\addon.node'),
    'pkg/addon.node'
  );
  assert.equal(toBareSpecifier('/app/addon.node'), null);
});
