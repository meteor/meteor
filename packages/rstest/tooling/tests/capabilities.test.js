const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  assertRstestOptionalCapabilities,
  selectRstestOptionalCapabilities,
} = require('../provider/capabilities.js');

function inventory(appDir, relativeFiles) {
  const files = relativeFiles.map(file => path.join(appDir, file));
  return {
    pureFiles: files.filter(file => /[\\/]pure[\\/]|[\\/]browser[\\/]/.test(file)),
    runtimeFiles: files.filter(file => /[\\/]runtime[\\/]/.test(file)),
    externalFiles: files.filter(file => /[\\/]e2e[\\/]/.test(file)),
  };
}

function installFixturePackage(appDir, packageName, manifest = {}) {
  const packageDir = path.join(appDir, 'node_modules', ...packageName.split('/'));
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
    name: packageName,
    version: '0.0.0-test',
    main: 'index.js',
    ...manifest,
  }));
  fs.writeFileSync(path.join(packageDir, 'index.js'), 'module.exports = {};\n');
}

test('selected roots derive only their project-owned optional capabilities', () => {
  const appDir = '/app';
  const selected = selectRstestOptionalCapabilities({
    command: 'test',
    coverage: true,
    inventory: inventory(appDir, [
      'tests/rstest/pure/server/math.test.js',
      'tests/rstest/pure/client/dom.test.js',
      'tests/rstest/browser/component.test.js',
      'tests/rstest/runtime/server/mongo.test.js',
      'tests/rstest/runtime/client/ddp.test.js',
      'tests/rstest/e2e/app.test.js',
    ]),
  });

  assert.deepEqual(selected, [
    'dom',
    'browser',
    'meteor-client',
    'e2e',
    'coverage',
  ]);
});

test('server-only native and Meteor runtime tests need no optional package', () => {
  const appDir = '/app';
  const selected = selectRstestOptionalCapabilities({
    command: 'test',
    coverage: false,
    inventory: inventory(appDir, [
      'tests/rstest/pure/server/math.test.js',
      'tests/rstest/runtime/server/mongo.test.js',
    ]),
  });

  assert.deepEqual(selected, []);
});

test('client package tests opt into project-owned Playwright', () => {
  assert.deepEqual(selectRstestOptionalCapabilities({
    command: 'test-packages',
    client: true,
    coverage: false,
    inventory: { pureFiles: [], runtimeFiles: [], externalFiles: [] },
  }), ['meteor-client']);
  assert.deepEqual(selectRstestOptionalCapabilities({
    command: 'test-packages',
    client: false,
    coverage: false,
    inventory: { pureFiles: [], runtimeFiles: [], externalFiles: [] },
  }), []);
});

test('missing optional capabilities report project install and browser commands', t => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-capability-'));
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(appDir, 'package.json'), '{}\n');

  assert.throws(() => assertRstestOptionalCapabilities({
    appDir,
    capabilities: ['dom', 'browser', 'e2e', 'coverage'],
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_OPTIONAL_DEPENDENCY_MISSING');
    assert.match(error.message, /project-owned/);
    assert.match(error.message, /meteor npm install --save-dev/);
    assert.match(error.message, /@rstest\/browser/);
    assert.match(error.message, /@rstest\/coverage-istanbul/);
    assert.match(error.message, /@rstest\/playwright/);
    assert.match(error.message, /jsdom/);
    assert.match(error.message, /playwright/);
    assert.match(error.message, /npx playwright install chromium/);
    return true;
  });
});

test('installed optional packages satisfy selected capabilities', t => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-capability-'));
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(appDir, 'package.json'), '{}\n');
  for (const packageName of [
    '@rstest/browser',
    '@rstest/coverage-v8',
    'jsdom',
    'playwright',
  ]) {
    installFixturePackage(appDir, packageName);
  }
  installFixturePackage(appDir, '@rstest/playwright', {
    type: 'module',
    main: './index.js',
    exports: {
      '.': { import: './index.js' },
      './package.json': './package.json',
    },
  });

  assert.doesNotThrow(() => assertRstestOptionalCapabilities({
    appDir,
    capabilities: ['dom', 'browser', 'meteor-client', 'e2e', 'coverage'],
  }));
});
