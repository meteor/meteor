const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildRstestArgs,
  configureRstestRuntimeMetadata,
  initializeRstestBuildPlugins,
  inspectAppRstestCapability,
  scanNativeRstestRoots,
  selectRstestInventory,
  selectRstestLanes,
  startRstestProcess,
} = require('../rstest-process.js');

function createApp() {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-router-'));
  fs.mkdirSync(path.join(appRoot, '.meteor'), { recursive: true });
  return appRoot;
}

test('Rstest and Rspack build plugins initialize after local package build and before caller continues', async () => {
  const order = [];
  const projectContext = {
    async buildLocalPackages() {
      order.push('build-local-packages');
    },
    isopackCache: {
      getIsopack(name) {
        order.push(`resolve-${name}`);
        return {
          async ensurePluginsInitialized() {
            order.push(`initialize-${name}`);
          },
        };
      },
    },
  };

  await initializeRstestBuildPlugins(projectContext, {
    enterJob: async (packageName, operation) => {
      order.push(`enter-${packageName}`);
      await operation();
    },
  });
  order.push('launch-rstest');

  assert.deepEqual(order, [
    'build-local-packages',
    'resolve-rspack',
    'enter-rspack',
    'initialize-rspack',
    'resolve-rstest-tooling',
    'enter-rstest-tooling',
    'initialize-rstest-tooling',
    'launch-rstest',
  ]);
});

test('Rstest runtime metadata is complete before build plugin initialization', () => {
  const metadata = { testRunner: 'rstest' };

  const selection = configureRstestRuntimeMetadata({
    metadata,
    options: {
      rstestRunRuntime: true,
      rstestHasRuntimeServer: true,
      rstestHasRuntimeClient: false,
      rstestHasExternal: false,
      once: true,
    },
    webArchs: ['web.browser'],
    createToken: () => 'test-token',
  });

  assert.deepEqual(selection, {
    hasDesktopBrowser: true,
    requiresDesktopBrowser: false,
    shouldRunRstestClient: false,
    shouldRunRstestExternal: false,
  });
  assert.deepEqual(metadata, {
    testRunner: 'rstest',
    rstestToken: 'test-token',
    rstestTestTimeout: 30000,
    rstestHookTimeout: 10000,
    rstestServer: true,
    rstestClient: false,
    rstestRuntime: true,
    rstestExternal: false,
  });
});

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

test('Meteor-owned options map to wrapper CLI while Rstest arguments stay native', () => {
  assert.deepEqual(buildRstestArgs({
    appDir: '/app',
    localDir: '/harness/.meteor/local',
    once: true,
    fullApp: false,
    server: true,
    client: false,
    command: 'test',
    config: 'config/rstest.js',
    project: 'meteor-pure-server',
    testFile: ['tests/a.test.js', 'tests/b.test.js'],
    testNamePattern: '^works$',
    passthrough: ['--coverage', '--retry', '2'],
  }), [
    '--cwd', '/app',
    '--local-dir', '/harness/.meteor/local',
    '--once',
    '--server-only',
    '--command', 'test',
    '--config', 'config/rstest.js',
    '--project', 'meteor-pure-server',
    '--test-file', 'tests/a.test.js',
    '--test-file', 'tests/b.test.js',
    '--test-name-pattern', '^works$',
    '--', '--coverage', '--retry', '2',
  ]);
});

test('architecture selection is forwarded to dynamic Rstest config context', () => {
  assert.deepEqual(buildRstestArgs({
    appDir: '/app',
    localDir: '/harness/.meteor/local',
    command: 'test',
    server: false,
    client: true,
  }), [
    '--cwd', '/app',
    '--local-dir', '/harness/.meteor/local',
    '--client-only',
    '--command', 'test',
  ]);
});

test('native passthrough cannot replace Meteor-owned config or project plan', () => {
  for (const argument of [
    '--config=other.js', '-c=other.js', '--root', '--project=other',
    '--passWithNoTests', '--passWithNoTests=true',
  ]) {
    assert.throws(() => buildRstestArgs({
      appDir: '/app',
      localDir: '/local',
      command: 'test',
      passthrough: [argument],
    }), /Meteor-owned/);
  }
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

test('stable Meteor Rstest flags map to native Rstest CLI options', () => {
  assert.deepEqual(buildRstestArgs({
    appDir: '/app',
    localDir: '/harness/.meteor/local',
    once: true,
    command: 'test',
    browser: 'firefox',
    coverage: true,
    updateSnapshots: true,
    shard: '2/4',
    changed: true,
    changedSince: 'main',
    passWithNoTests: true,
  }), [
    '--cwd', '/app',
    '--local-dir', '/harness/.meteor/local',
    '--once',
    '--command', 'test',
    '--browser.name', 'firefox',
    '--coverage',
    '--update',
    '--shard', '2/4',
    '--changed', 'main',
    '--passWithNoTests',
  ]);
});

test('supervised Rstest process receives graceful stop and settles once', async t => {
  const appRoot = createApp();
  const packageRoot = path.join(appRoot, 'node_modules/@meteorjs/rstest');
  const marker = path.join(appRoot, 'lifecycle.log');
  fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@meteorjs/rstest',
    version: '0.0.0-test',
  }));
  fs.writeFileSync(path.join(packageRoot, 'bin/meteor-rstest.js'), `
    const fs = require('node:fs');
    fs.appendFileSync(${JSON.stringify(marker)}, 'started\\n');
    process.on('SIGTERM', () => {
      fs.appendFileSync(${JSON.stringify(marker)}, 'stopped\\n');
      process.exit(0);
    });
    setInterval(() => {}, 1000);
  `);
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  const processHandle = startRstestProcess({ appDir: appRoot, args: [], stdio: 'ignore' });
  for (let attempt = 0; attempt < 50 && !fs.existsSync(marker); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(fs.readFileSync(marker, 'utf8'), 'started\n');

  await processHandle.stop();
  assert.equal(await processHandle.completion, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'started\nstopped\n');
});
