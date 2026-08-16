const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  getRstestCacheVersion,
  getRstestMeteorTestFlags,
  hasTypescriptRstestInputs,
  isRstestRuntimeBuild,
  readRstestRuntimeInventory,
  readRstestRuntimeSettings,
  shouldCleanRstestOutput,
} = require('../lib/rstest.js');

test('Rstest cache version separates coverage and runtime environment changes', () => {
  const base = {
    testRunnerContext: { testRunner: 'rstest' },
    runtimeSettings: { env: { SENTINEL: '' } },
  };
  const disabled = getRstestCacheVersion(base);
  const covered = getRstestCacheVersion({
    ...base,
    testRunnerContext: {
      ...base.testRunnerContext,
      coverageGeneration: 'abcdef1234567890',
    },
  });
  const changedEnvironment = getRstestCacheVersion({
    ...base,
    runtimeSettings: { env: { SENTINEL: 'true' } },
  });

  assert.notEqual(disabled, covered);
  assert.notEqual(disabled, changedEnvironment);
  assert.equal(getRstestCacheVersion({ testRunnerContext: {} }), null);
});

test('Rstest test builds clean stale output outside isolated workers', () => {
  assert.equal(shouldCleanRstestOutput({
    isProd: false,
    isRstestTest: true,
    isWorker: false,
  }), true);
  assert.equal(shouldCleanRstestOutput({
    isProd: false,
    isRstestTest: true,
    isWorker: true,
  }), false);
  assert.equal(shouldCleanRstestOutput({
    isProd: true,
    isRstestTest: false,
    isWorker: false,
  }), true);
});

test('mixed runtime and full-app builds expose both Meteor test flags', () => {
  assert.deepEqual(getRstestMeteorTestFlags({
    isTestLike: true,
    isTestFullApp: true,
    isRstestTest: true,
  }), { isTest: true, isAppTest: true });
  assert.deepEqual(getRstestMeteorTestFlags({
    isTestLike: true,
    isTestFullApp: true,
    isRstestTest: false,
  }), { isTest: false, isAppTest: true });
  assert.deepEqual(getRstestMeteorTestFlags({
    isTestLike: true,
    isTestFullApp: false,
    isRstestTest: true,
  }), { isTest: true, isAppTest: false });
});

test('Rstest runtime build accepts runner identity from provider context', () => {
  assert.equal(isRstestRuntimeBuild({
    testRunner: undefined,
    testRunnerContext: { testRunner: 'rstest', runtime: true },
    isTest: true,
  }), true);
  assert.equal(isRstestRuntimeBuild({
    testRunner: undefined,
    testRunnerContext: { runtime: true },
    isTest: true,
  }), false);
  assert.equal(isRstestRuntimeBuild({
    testRunner: 'rstest',
    testRunnerContext: { testRunner: 'rstest', runtime: false },
    isTest: true,
  }), false);
});

test('Rstest runtime infers TypeScript from selected tests and setup files', () => {
  assert.equal(hasTypescriptRstestInputs({
    files: ['/runtime/package.tests.ts'],
    setupFiles: [],
  }), true);
  assert.equal(hasTypescriptRstestInputs({
    files: ['/runtime/package.tests.js'],
    setupFiles: ['/runtime/setup.tsx'],
  }), true);
  assert.equal(hasTypescriptRstestInputs({
    files: ['/runtime/package.tests.js'],
    setupFiles: ['/runtime/setup.mjs'],
  }), false);
});

test('versioned runtime inventory selects exact files per architecture', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = path.join(root, 'runtime.json');
  const serverFile = path.join(root, 'imports/server.test.ts');
  const clientFile = path.join(root, 'imports/client.test.ts');
  fs.writeFileSync(manifest, JSON.stringify({
    schemaVersion: 2,
    serverFiles: [serverFile],
    clientFiles: [clientFile],
  }));

  assert.deepEqual(readRstestRuntimeInventory({
    manifest,
    projectDir: root,
    client: false,
  }), { discoveryRoot: root, files: [serverFile] });
  assert.deepEqual(readRstestRuntimeInventory({
    manifest,
    projectDir: root,
    client: true,
  }), { discoveryRoot: root, files: [clientFile] });
});

test('runtime settings expose only absolute setup files to Rspack', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-settings-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const setupFile = path.join(root, 'setup.js');
  const settings = path.join(root, 'settings.json');
  fs.writeFileSync(setupFile, '');
  fs.writeFileSync(settings, JSON.stringify({
    schemaVersion: 1,
    setupFiles: [setupFile],
  }));

  assert.deepEqual(readRstestRuntimeSettings(settings).setupFiles, [setupFile]);
  fs.writeFileSync(settings, JSON.stringify({
    schemaVersion: 1,
    setupFiles: ['./setup.js'],
  }));
  assert.throws(
    () => readRstestRuntimeSettings(settings),
    /Invalid runtime settings/,
  );
});

test('legacy runtime inventory keeps legacy discovery root', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = path.join(root, 'runtime.json');
  const file = path.join(root, 'tests/rstest/runtime/server/items.test.js');
  fs.writeFileSync(manifest, JSON.stringify([file]));

  assert.deepEqual(readRstestRuntimeInventory({
    manifest,
    projectDir: root,
    client: false,
  }), {
    discoveryRoot: path.join(root, 'tests/rstest/runtime/server'),
    files: [file],
  });
});

test('versioned package inventory can declare generated discovery root', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectDir = path.join(root, 'source-app');
  const discoveryRoot = path.join(root, 'package-runtime');
  const manifest = path.join(root, 'runtime.json');
  const serverFile = path.join(discoveryRoot, 'package.test.mjs');
  fs.mkdirSync(discoveryRoot, { recursive: true });
  fs.writeFileSync(manifest, JSON.stringify({
    schemaVersion: 2,
    discoveryRoot,
    testFileRoot: '',
    serverFiles: [serverFile],
    clientFiles: [serverFile],
  }));

  assert.deepEqual(readRstestRuntimeInventory({
    manifest,
    projectDir,
    client: false,
  }), { discoveryRoot, files: [serverFile], testFileRoot: '' });
});
