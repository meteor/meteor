const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  inspectAppRstestCapability,
  scanRstestCandidates,
  scanNativeRstestRoots,
  selectRstestInventory,
  selectRstestLanes,
} = require('../provider/inventory.js');

function createApp() {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-router-'));
  fs.mkdirSync(path.join(appRoot, '.meteor'), { recursive: true });
  return appRoot;
}

test('app capability inspection reads direct Atmosphere constraint and package opt-out', t => {
  const appRoot = createApp();
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(appRoot, '.meteor/packages'), '# comment\nrspack\nrstest@0.1.0-beta.0\n');
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({
    meteor: { testRunner: 'driver' },
  }));

  assert.deepEqual(inspectAppRstestCapability(appRoot), {
    hasRstestPackage: true,
    hasRstestConfig: false,
    packageJsonMeteor: { testRunner: 'driver' },
  });
});

test('explicit project and file filters resolve against owned lane inventory', t => {
  const appRoot = createApp();
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  for (const file of [
    'tests/rstest/pure/server/math.test.js',
    'tests/rstest/pure/client/dom.test.js',
    'tests/rstest/runtime/server/mongo.test.js',
    'tests/rstest/e2e/app.test.js',
    'imports/api/legacy.tests.js',
  ]) {
    const absolute = path.join(appRoot, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, '');
  }
  const roots = scanNativeRstestRoots(appRoot);

  const runtime = selectRstestInventory({
    appDir: appRoot,
    roots,
    projects: ['meteor-runtime-server'],
    testFile: 'tests/rstest/runtime/**/*.test.js',
  });
  assert.deepEqual(runtime.runtimeFiles, [
    path.join(appRoot, 'tests/rstest/runtime/server/mongo.test.js'),
  ]);
  assert.deepEqual(runtime.pureFiles, []);
  assert.deepEqual(runtime.externalFiles, []);

  const basename = selectRstestInventory({
    appDir: appRoot,
    roots,
    testFile: 'math.test.js',
  });
  assert.deepEqual(basename.pureFiles, [
    path.join(appRoot, 'tests/rstest/pure/server/math.test.js'),
  ]);

  const missingSide = selectRstestInventory({
    appDir: appRoot,
    roots,
    projects: ['meteor-runtime-client'],
  });
  assert.deepEqual(missingSide.runtimeFiles, []);

  const custom = selectRstestInventory({
    appDir: appRoot,
    roots,
    projects: ['domain-project'],
  });
  assert.deepEqual(custom.unknownProjects, ['domain-project']);
});

test('native root scan separates pure Rstest and Meteor runtime work', t => {
  const appRoot = createApp();
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(appRoot, 'tests/rstest/pure/server'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'tests/rstest/runtime/server'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'tests/rstest/e2e'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'tests/legacy'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'imports/api'), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'tests/rstest/pure/server/math.test.js'), '');
  fs.writeFileSync(path.join(appRoot, 'tests/rstest/runtime/server/mongo.test.js'), '');
  fs.writeFileSync(path.join(appRoot, 'tests/rstest/e2e/app.test.js'), '');
  fs.writeFileSync(path.join(appRoot, 'tests/legacy/mocha.tests.js'), '');
  fs.writeFileSync(path.join(appRoot, 'imports/api/existing.tests.js'), '');

  assert.deepEqual(scanNativeRstestRoots(appRoot), {
    hasPure: true,
    hasRuntime: true,
    hasExternal: true,
    pureFiles: [path.join(appRoot, 'tests/rstest/pure/server/math.test.js')],
    runtimeFiles: [path.join(appRoot, 'tests/rstest/runtime/server/mongo.test.js')],
    externalFiles: [path.join(appRoot, 'tests/rstest/e2e/app.test.js')],
    legacyFiles: [
      path.join(appRoot, 'imports/api/existing.tests.js'),
      path.join(appRoot, 'tests/legacy/mocha.tests.js'),
    ],
  });
});

test('candidate scan finds colocated tests without assigning execution by directory', t => {
  const appRoot = createApp();
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  for (const file of [
    'imports/api/math.test.js',
    'imports/api/login.app-test.js',
    'imports/api/items.rstest.test.ts',
    'tests/rstest/runtime/server/existing.test.js',
    'tests/legacy/mocha.test.js',
    'node_modules/ignored.test.js',
    '.meteor/local/ignored.test.js',
  ]) {
    const absolute = path.join(appRoot, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, '');
  }

  assert.deepEqual(scanRstestCandidates(appRoot), {
    candidateFiles: [
      path.join(appRoot, 'imports/api/items.rstest.test.ts'),
      path.join(appRoot, 'imports/api/math.test.js'),
      path.join(appRoot, 'tests/rstest/runtime/server/existing.test.js'),
    ],
    legacyRootFiles: [
      path.join(appRoot, 'tests/legacy/mocha.test.js'),
    ],
  });
  assert.deepEqual(scanRstestCandidates(appRoot, { fullApp: true }), {
    candidateFiles: [
      path.join(appRoot, 'imports/api/items.rstest.test.ts'),
      path.join(appRoot, 'imports/api/login.app-test.js'),
      path.join(appRoot, 'imports/api/math.test.js'),
      path.join(appRoot, 'tests/rstest/runtime/server/existing.test.js'),
    ],
    legacyRootFiles: [
      path.join(appRoot, 'tests/legacy/mocha.test.js'),
    ],
  });
});

test('explicit generated project selects only its owning execution lane', () => {
  assert.deepEqual(selectRstestLanes(), { native: true, runtime: true, external: true });
  assert.deepEqual(selectRstestLanes('meteor-browser'), {
    native: true, runtime: false, external: false,
  });
  assert.deepEqual(selectRstestLanes('meteor-runtime-server'), {
    native: false, runtime: true, external: false,
  });
  assert.deepEqual(selectRstestLanes('meteor-e2e'), {
    native: false, runtime: false, external: true,
  });
  assert.deepEqual(selectRstestLanes(['domain-pure', 'meteor-runtime-client']), {
    native: true,
    runtime: true,
    external: false,
  });
});
