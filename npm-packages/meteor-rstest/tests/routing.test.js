const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  parseRstestFilename,
} = require('../src/routing/markers.js');
const {
  classifyRstestCandidates,
} = require('../src/routing/classifier.js');

function write(root, filename, source) {
  const absolute = path.join(root, filename);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, source);
  return absolute;
}

test('filename markers opt files into each supported Rstest environment', () => {
  const cases = [
    ['math.rstest.test.ts', {
      owned: true,
      execution: null,
      environment: null,
      architectures: [],
    }],
    ['math.native.rstest.test.ts', {
      owned: true,
      execution: 'native',
      environment: 'node',
      architectures: [],
    }],
    ['counter.dom.rstest.test.tsx', {
      owned: true,
      execution: 'native',
      environment: 'jsdom',
      architectures: ['client'],
    }],
    ['items.meteor.rstest.test.ts', {
      owned: true,
      execution: 'meteor-runtime',
      environment: 'meteor',
      architectures: [],
    }],
    ['items.server.meteor.rstest.test.ts', {
      owned: true,
      execution: 'meteor-runtime',
      environment: 'meteor',
      architectures: ['server'],
    }],
    ['subscription.client.meteor.rstest.spec.ts', {
      owned: true,
      execution: 'meteor-runtime',
      environment: 'meteor',
      architectures: ['client'],
    }],
    ['counter.browser.rstest.test.tsx', {
      owned: true,
      execution: 'native',
      environment: 'browser',
      architectures: ['client'],
    }],
    ['login.e2e.rstest.test.ts', {
      owned: true,
      execution: 'external-e2e',
      environment: 'node',
      architectures: [],
    }],
  ];

  for (const [filename, expected] of cases) {
    assert.deepEqual(parseRstestFilename(filename), {
      ...expected,
      conflicts: [],
    }, filename);
  }
});

test('ordinary tests stay unowned and conflicting markers fail deterministically', () => {
  assert.deepEqual(parseRstestFilename('math.test.ts'), {
    owned: false,
    execution: null,
    environment: null,
    architectures: [],
    conflicts: [],
  });
  assert.deepEqual(
    parseRstestFilename('counter.browser.meteor.rstest.test.ts'),
    {
      owned: true,
      execution: null,
      environment: null,
      architectures: [],
      conflicts: ['browser conflicts with meteor'],
    },
  );
  assert.deepEqual(
    parseRstestFilename('items.server.client.meteor.rstest.test.ts'),
    {
      owned: true,
      execution: null,
      environment: null,
      architectures: [],
      conflicts: ['server conflicts with client'],
    },
  );
});

test('resolved imports and filename hints produce exact smart routing manifest', async t => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-routing-'));
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  for (const packageName of ['core', 'browser', 'playwright']) {
    write(appRoot, `node_modules/@rstest/${packageName}/package.json`, JSON.stringify({
      name: `@rstest/${packageName}`,
      version: '0.0.0-test',
      main: 'index.js',
    }));
    write(appRoot, `node_modules/@rstest/${packageName}/index.js`, 'export const test = () => {};');
  }
  write(appRoot, 'support/test-api.js', "export { test } from '@rstest/core';");
  write(appRoot, 'domain/items.js', "import 'meteor/mongo'; export const count = 1;");
  const native = write(appRoot, 'imports/math.test.js', "import { test } from '@rstest/core'; test('math', () => {});");
  const wrapped = write(appRoot, 'imports/wrapped.test.js', "import { test } from '../support/test-api.js'; test('wrapped', () => {});");
  const runtime = write(appRoot, 'imports/items.test.js', "import { test } from '@rstest/core'; import '../domain/items.js'; test('items', () => {});");
  const browser = write(appRoot, 'imports/counter.test.js', "import { test } from '@rstest/browser'; test('counter', () => {});");
  const e2e = write(appRoot, 'imports/login.test.js', "import { test } from '@rstest/playwright'; test('login', () => {});");
  const globalNative = write(appRoot, 'imports/global.native.rstest.test.js', "test('global', () => {});");
  const explicitServer = write(appRoot, 'imports/items.server.meteor.rstest.test.js', "test('server', () => {});");
  const legacy = write(appRoot, 'imports/mocha.test.js', "describe('legacy', () => {});");

  const manifest = await classifyRstestCandidates({
    appRoot,
    candidates: [native, wrapped, runtime, browser, e2e, globalNative, explicitServer, legacy],
    server: true,
    client: true,
  });

  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.nativeNodeFiles, [globalNative, native, wrapped].sort());
  assert.deepEqual(manifest.nativeDomFiles, []);
  assert.deepEqual(manifest.browserFiles, [browser]);
  assert.deepEqual(manifest.runtimeServerFiles, [explicitServer, runtime].sort());
  assert.deepEqual(manifest.runtimeClientFiles, [runtime]);
  assert.deepEqual(manifest.externalFiles, [e2e]);
  assert.deepEqual(manifest.legacyFiles, [legacy]);
});

test('filename hints cannot force real dependencies into incompatible runtimes', async t => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-conflict-'));
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  const nativeMeteor = write(
    appRoot,
    'imports/items.native.rstest.test.js',
    "import 'meteor/mongo';",
  );
  const externalMeteor = write(
    appRoot,
    'imports/items.e2e.rstest.test.js',
    "import 'meteor/meteor';",
  );

  await assert.rejects(
    () => classifyRstestCandidates({ appRoot, candidates: [nativeMeteor] }),
    error => error.code === 'RSTEST_ROUTING_CONFLICT' &&
      /native.*meteor|meteor.*native/i.test(error.message),
  );
  await assert.rejects(
    () => classifyRstestCandidates({ appRoot, candidates: [externalMeteor] }),
    error => error.code === 'RSTEST_ROUTING_CONFLICT' &&
      /external.*meteor|meteor.*external/i.test(error.message),
  );
});

test('legacy meteor/rstest declaration imports fail with migration guidance', async t => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-legacy-api-'));
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  const legacyApi = write(
    appRoot,
    'imports/legacy-api.test.js',
    "import { test } from 'meteor/rstest'; test('legacy', () => {});",
  );

  await assert.rejects(
    () => classifyRstestCandidates({ appRoot, candidates: [legacyApi] }),
    error => error.code === 'RSTEST_LEGACY_RUNTIME_API' &&
      /@rstest\/core/.test(error.message),
  );
});
