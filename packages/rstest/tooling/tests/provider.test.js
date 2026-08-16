const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  getPackageHarnessDevDependencies,
  resolveRstestCoverageInstrumentation,
  RstestTestRunnerProvider,
  writePrivateJsonAtomic,
} = require('../provider/provider.js');

test('package harness pins configured local Rspack npm package', () => {
  assert.deepEqual(getPackageHarnessDevDependencies({
    METEOR_RSPACK_NPM_SPEC: '/repo/npm-packages/meteor-rspack',
  }), {
    '@meteorjs/rspack': '/repo/npm-packages/meteor-rspack',
  });
  assert.deepEqual(getPackageHarnessDevDependencies({}), {});
});

test('coverage instrumentation resolves from the coordinator dependency context', () => {
  const npmRoot = path.resolve(__dirname, '../../../../npm-packages/meteor-rstest');

  const instrumentation = resolveRstestCoverageInstrumentation(npmRoot);

  assert.match(
    instrumentation.swcPlugin,
    /swc-plugin-coverage-instrument.*\.wasm$/,
  );
  assert.match(
    instrumentation.babelPlugin,
    /babel-plugin-istanbul/,
  );
});

function createContext(t, overrides = {}) {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-provider-'));
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(appDir, '.meteor'), { recursive: true });
  fs.writeFileSync(path.join(appDir, '.meteor', 'packages'), 'rstest\nrspack\n');
  fs.writeFileSync(path.join(appDir, 'package.json'), '{"meteor":{}}\n');
  return {
    command: 'test',
    appDir,
    harnessRoot: appDir,
    localPackages: [],
    packageTests: [],
    localDir: path.join(appDir, '.meteor', 'local'),
    architectures: ['os.test'],
    webArchs: ['web.browser'],
    options: {
      once: true,
      fullApp: false,
      serverOnly: false,
      clientOnly: false,
      project: [],
      testFile: [],
      runtimeWorkers: 1,
      passthrough: [],
    },
    npm: {
      root: appDir,
      autoInstall: true,
      async ensureHarnessManifest() {},
    },
    worker: null,
    meteorHosts: {
      start() {
        throw new Error('Unexpected Meteor host pool start.');
      },
    },
    ...overrides,
  };
}

function writeRuntimeFiles(appDir, names) {
  return names.map(name => {
    const filename = path.join(
      appDir,
      'tests',
      'rstest',
      'runtime',
      'server',
      name
    );
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, '');
    return filename;
  });
}

function settingsWriter(calls) {
  return ({ args }) => {
    calls.push(args);
    const outputFlag = args.includes('--runtime-plan-output')
      ? '--runtime-plan-output'
      : '--runtime-settings-output';
    const output = args[args.indexOf(outputFlag) + 1];
    const generation = args[args.indexOf('--runtime-settings-generation') + 1];
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({
      schemaVersion: 1,
      generation,
      testTimeout: 45000,
      hookTimeout: 15000,
      maxConcurrency: 2,
      retry: 2,
      clearMocks: true,
      env: { FEATURE: 'enabled' },
    }));
    return { completion: Promise.resolve(0), async stop() {} };
  };
}

function argumentValues(args, flag) {
  return args.flatMap((value, index) => value === flag ? [args[index + 1]] : []);
}

function writeCoverageSettings({ args, context }) {
  const settingsFlag = args.includes('--runtime-plan-output')
    ? '--runtime-plan-output'
    : '--runtime-settings-output';
  const settingsPath = args[args.indexOf(settingsFlag) + 1];
  const settingsGeneration = args[
    args.indexOf('--runtime-settings-generation') + 1
  ];
  const coveragePlanPath = args[args.indexOf('--coverage-plan-output') + 1];
  const coverageGeneration = args[args.indexOf('--coverage-generation') + 1];
  const artifactRoot = path.dirname(coveragePlanPath);
  fs.mkdirSync(artifactRoot, { recursive: true });
  const coverage = {
    schemaVersion: 1,
    generation: coverageGeneration,
    enabled: true,
    provider: 'istanbul',
    root: context.appDir,
    include: [],
    exclude: [],
    allowExternal: false,
    artifactRoot,
  };
  fs.writeFileSync(coveragePlanPath, JSON.stringify(coverage));
  fs.writeFileSync(settingsPath, JSON.stringify({
    schemaVersion: 1,
    generation: settingsGeneration,
    testTimeout: 30000,
    hookTimeout: 10000,
    maxConcurrency: 5,
    coverage,
  }));
}

test('validation rejects conflicting sides before dependency installation', async t => {
  const context = createContext(t);
  context.options.serverOnly = true;
  context.options.clientOnly = true;
  let installs = 0;
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {
      installs += 1;
    },
  });

  await assert.rejects(provider.validate(), error => {
    assert.equal(error.code, 'METEOR_RSTEST_CONFLICTING_SIDES');
    return true;
  });
  assert.equal(installs, 0);
});

test('unified upstream runtime reaches host/build metadata', async t => {
  const context = createContext(t);
  context.options.serverOnly = true;
  context.options.project = ['meteor-runtime-server'];
  context.options.updateSnapshots = true;
  writeRuntimeFiles(context.appDir, ['upstream.test.js']);
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(plan.metadata.upstreamRuntime, true);
  assert.equal(plan.metadata.updateSnapshot, 'all');
  assert.equal(plan.metadata.appRoot, context.appDir);
  assert.equal(plan.buildPluginOptions.rspack.context.upstreamRuntime, true);
});

test('pure tests prepare native-only plan with opaque Rspack options', async t => {
  const context = createContext(t);
  const testFile = path.join(
    context.appDir,
    'tests/rstest/pure/server/math.test.js'
  );
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, '');
  const order = [];
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {
      order.push('dependencies');
    },
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.deepEqual(order, ['dependencies']);
  assert.equal(plan.mode, 'native-only');
  assert.equal('driverPackage' in plan, false);
  assert.equal(plan.metadata.runtime, false);
  assert.equal(plan.buildPluginOptions.rspack.lifecycle, 'dependencies-only');
  assert.equal(plan.buildPluginOptions.rspack.context.runtime, false);
  assert.deepEqual(
    argumentValues(provider.nativeArgs, '--architecture'),
    ['os.test', 'web.browser']
  );
});

test('colocated smart candidates classify after dependency bootstrap and drive host plan', async t => {
  const context = createContext(t);
  context.options.testFile = ['imports/*.test.js'];
  const nativeFile = path.join(context.appDir, 'imports/math.test.js');
  const runtimeFile = path.join(context.appDir, 'imports/items.test.js');
  fs.mkdirSync(path.dirname(nativeFile), { recursive: true });
  fs.writeFileSync(nativeFile, "import { test } from '@rstest/core';");
  fs.writeFileSync(runtimeFile, "import { test } from '@rstest/core'; import 'meteor/mongo';");
  const order = [];
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {
      order.push('dependencies');
    },
    async classifyRstestCandidates({ candidates }) {
      order.push('classification');
      assert.deepEqual(candidates, [runtimeFile, nativeFile]);
      return {
        schemaVersion: 1,
        nativeNodeFiles: [nativeFile],
        nativeDomFiles: [],
        browserFiles: [],
        runtimeServerFiles: [runtimeFile],
        runtimeClientFiles: [runtimeFile],
        externalFiles: [],
        legacyFiles: [],
        files: [],
      };
    },
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.deepEqual(order, ['dependencies', 'classification']);
  assert.equal(plan.mode, 'meteor-host');
  assert.equal(plan.driverPackage, 'rstest');
  assert.deepEqual(provider.selection.inventory.pureFiles, [nativeFile]);
  assert.deepEqual(provider.selection.inventory.runtimeFiles, [runtimeFile]);
  assert.ok(provider.nativeArgs.includes('--routing-manifest'));
  assert.equal(provider.nativeArgs.includes('--test-file'), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(provider.runtimeManifest, 'utf8')), {
    schemaVersion: 2,
    serverFiles: [runtimeFile],
    clientFiles: [runtimeFile],
  });
});

test('explicit custom projects stay owned by user config without smart classification', async t => {
  const context = createContext(t);
  context.options.project = ['custom-project'];
  const file = path.join(context.appDir, 'imports/custom.test.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "import { test } from 'custom-test-engine';");
  let classifications = 0;
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    async classifyRstestCandidates() { classifications += 1; },
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(classifications, 0);
  assert.equal(plan.mode, 'native-only');
  assert.deepEqual(provider.selection.nativeProjects, ['custom-project']);
});

test('unmarked globals can remain owned by an explicit Rstest config', async t => {
  const context = createContext(t);
  const file = path.join(context.appDir, 'imports/config-owned.test.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "test('config owned', () => {});");
  fs.writeFileSync(path.join(context.appDir, 'rstest.config.js'), 'module.exports = {};');
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    async classifyRstestCandidates() {
      return {
        schemaVersion: 1,
        nativeNodeFiles: [],
        nativeDomFiles: [],
        browserFiles: [],
        runtimeServerFiles: [],
        runtimeClientFiles: [],
        externalFiles: [],
        legacyFiles: [file],
        files: [],
      };
    },
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(plan.mode, 'native-only');
  assert.equal(provider.selection.shouldRunNative, true);
});

test('explicit generated runtime project never delegates legacy files to user config', async t => {
  const context = createContext(t);
  context.options.project = ['meteor-runtime-server'];
  const runtimeFile = path.join(
    context.appDir,
    'tests/rstest/runtime/server/items.test.js',
  );
  const legacyFile = path.join(context.appDir, 'imports/config-owned.test.js');
  for (const file of [runtimeFile, legacyFile]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }
  fs.writeFileSync(path.join(context.appDir, 'rstest.config.js'), 'module.exports = {};');
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    async classifyRstestCandidates() {
      return {
        schemaVersion: 1,
        nativeNodeFiles: [],
        nativeDomFiles: [],
        browserFiles: [],
        runtimeServerFiles: [runtimeFile],
        runtimeClientFiles: [],
        externalFiles: [],
        legacyFiles: [legacyFile],
        files: [],
      };
    },
  });

  await provider.validate();
  await provider.prepare();

  assert.equal(provider.selection.shouldRunNative, false);
  assert.ok(provider.runtimePlanArgs);
});

test('normalized Meteor verbosity reaches runtime metadata and Rstest wrapper', async t => {
  const context = createContext(t);
  context.verbose = true;
  const testFile = path.join(
    context.appDir,
    'tests/rstest/pure/server/verbose.test.js'
  );
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, '');
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(plan.metadata.verbose, true);
  assert.ok(provider.nativeArgs.includes('--verbose'));
});

test('native verbose reporter enables runtime detail without Meteor diagnostics', async t => {
  const forms = [
    ['--reporters=verbose'],
    ['--reporter=verbose'],
    ['--reporters', 'verbose'],
    ['--reporter', 'verbose'],
  ];

  for (const passthrough of forms) {
    const context = createContext(t);
    context.options.passthrough = passthrough;
    const testFile = path.join(
      context.appDir,
      'tests/rstest/pure/server/verbose-reporter.test.js'
    );
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, '');
    const provider = new RstestTestRunnerProvider(context, {
      async ensureRstestInstalled() {},
    });

    await provider.validate();
    const plan = await provider.prepare();

    assert.equal(plan.metadata.verbose, false, passthrough.join(' '));
    assert.equal(plan.metadata.reportVerbose, true, passthrough.join(' '));
    assert.equal(provider.nativeArgs.includes('--verbose'), false);
    assert.deepEqual(
      provider.nativeArgs.slice(-passthrough.length),
      passthrough
    );
  }
});

test('non-verbose native reporter keeps runtime report compact', async t => {
  const context = createContext(t);
  context.options.passthrough = ['--reporters=dot'];
  const testFile = path.join(
    context.appDir,
    'tests/rstest/pure/server/dot-reporter.test.js'
  );
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, '');
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(plan.metadata.verbose, false);
  assert.equal(plan.metadata.reportVerbose, false);
});

test('compatibility ownership routing stays silent at every verbosity', async t => {
  async function validate(verbose) {
    const context = createContext(t);
    context.verbose = verbose;
    const nativeFile = path.join(
      context.appDir,
      'tests/rstest/pure/server/native.test.js'
    );
    const legacyFile = path.join(context.appDir, 'imports/legacy.test.js');
    fs.mkdirSync(path.dirname(nativeFile), { recursive: true });
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    fs.writeFileSync(nativeFile, '');
    fs.writeFileSync(legacyFile, '');
    const warnings = [];
    const provider = new RstestTestRunnerProvider(context, {
      async ensureRstestInstalled() {},
      async classifyRstestCandidates() {
        return {
          schemaVersion: 1,
          nativeNodeFiles: [],
          nativeDomFiles: [],
          browserFiles: [],
          runtimeServerFiles: [],
          runtimeClientFiles: [],
          externalFiles: [],
          legacyFiles: [legacyFile],
          files: [],
        };
      },
      warn(message) { warnings.push(message); },
    });

    await provider.validate();
    await provider.prepare();
    return { provider, warnings };
  }

  const quiet = await validate(false);
  assert.deepEqual(quiet.warnings, []);

  const verbose = await validate(true);
  assert.deepEqual(verbose.warnings, []);
  assert.equal(verbose.provider.metadata.verbose, true);
});

test('runtime-only selection uses config plan without leaking runtime filters to native Rstest', async t => {
  const context = createContext(t);
  context.architectures = ['os.test', 'web.browser', 'web.browser.legacy'];
  context.options.project = ['meteor-runtime-server'];
  context.options.testFile = ['mongo.test.js'];
  const runtimeFile = path.join(
    context.appDir,
    'tests/rstest/runtime/server/mongo.test.js'
  );
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.writeFileSync(runtimeFile, '');
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(plan.mode, 'meteor-host');
  assert.equal(plan.driverPackage, 'rstest');
  assert.ok(provider.runtimePlanArgs.includes('--once'));
  assert.ok(provider.runtimePlanArgs.includes('--runtime-plan-output'));
  assert.equal(provider.runtimePlanArgs.includes('--project'), false);
  assert.equal(provider.runtimePlanArgs.includes('--test-file'), false);
  assert.deepEqual(
    argumentValues(provider.runtimePlanArgs, '--architecture'),
    ['os.test', 'web.browser']
  );
});

test('runtime worker parent evaluates config once then starts deterministic hosts', async t => {
  const calls = [];
  const started = [];
  const aggregateCalls = [];
  const context = createContext(t);
  context.options.serverOnly = true;
  context.options.project = ['meteor-runtime-server'];
  context.options.runtimeWorkers = 2;
  context.verbose = false;
  context.options.passthrough = ['--reporters=verbose'];
  writeRuntimeFiles(context.appDir, ['b.test.js', 'a.test.js']);
  context.meteorHosts = {
    start(descriptors) {
      started.push(descriptors);
      return {
        completion: Promise.resolve({
          workers: descriptors.map((host, index) => ({
            id: host.id,
            index,
            total: descriptors.length,
            code: 0,
            signal: null,
            stdout: '',
            stderr: '',
          })),
        }),
        async stop() {},
      };
    },
  };
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    aggregateRstestWorkerResults(options) {
      aggregateCalls.push(options);
      return { exitCode: 0 };
    },
    startRstestProcess: settingsWriter(calls),
  });

  await provider.validate();
  const plan = await provider.prepare();
  assert.equal(plan.mode, 'native-only');
  assert.equal(plan.metadata.verbose, false);
  assert.equal(plan.metadata.reportVerbose, true);

  const preHost = await provider.startBeforeHost({ updateMetadata() {} });
  assert.equal(await preHost.process.completion, 0);
  assert.equal(calls.length, 1);
  assert.equal(started.length, 1);
  assert.deepEqual(started[0].map(host => host.id), ['server-1', 'server-2']);
  assert.match(started[0][0].payload.runtimeFiles[0], /a\.test\.js$/);
  assert.match(started[0][1].payload.runtimeFiles[0], /b\.test\.js$/);
  assert.equal(aggregateCalls.length, 1);
  assert.equal(aggregateCalls[0].verbose, true);
});

test('coverage-enabled worker parent declares the exact descriptor artifacts', async t => {
  const context = createContext(t);
  context.options.serverOnly = true;
  context.options.project = ['meteor-runtime-server'];
  context.options.runtimeWorkers = 2;
  context.options.coverage = true;
  writeRuntimeFiles(context.appDir, ['b.test.js', 'a.test.js']);
  const started = [];
  context.meteorHosts = {
    start(descriptors) {
      started.push(descriptors);
      return {
        completion: Promise.resolve({ workers: [] }),
        async stop() {},
      };
    },
  };
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    assertRstestOptionalCapabilities() {},
    resolveRstestCoverageInstrumentation() {
      return {
        swcPlugin: '/integration/coverage.wasm',
        babelPlugin: '/integration/istanbul.js',
      };
    },
    aggregateRstestWorkerResults() { return { exitCode: 0 }; },
    startRstestProcess({ args }) {
      writeCoverageSettings({ args, context });
      return { completion: Promise.resolve(0), async stop() {} };
    },
  });

  await provider.validate();
  await provider.prepare();
  assert.deepEqual(
    provider.workerHostPlan.descriptors.map(item => item.payload.coveragePath),
    provider.coverageArtifacts.map(item => item.path),
  );
  assert.deepEqual(
    provider.coverageArtifacts.map(item => item.producer),
    ['worker-server-1', 'worker-server-2'],
  );
  await provider.startBeforeHost({ updateMetadata() {} });
  assert.equal(started.length, 1);
});

test('runtime worker child reuses parent settings and skips native Rstest', async t => {
  const context = createContext(t);
  context.options.serverOnly = true;
  context.options.project = ['meteor-runtime-server'];
  const runtimeFile = path.join(
    context.appDir,
    'imports/worker.server.meteor.rstest.test.js',
  );
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.writeFileSync(runtimeFile, "import { test } from '@rstest/core'; import 'meteor/mongo';");
  const generation = '1234567890abcdef1234567890abcdef';
  const coverageGeneration = 'abcdef1234567890abcdef1234567890';
  const coverageRoot = path.join(
    context.localDir,
    'rstest',
    'coverage',
    coverageGeneration,
  );
  const workersRoot = path.join(context.localDir, 'rstest', 'workers');
  fs.mkdirSync(workersRoot, { recursive: true });
  const runtimeSettingsPath = path.join(
    context.localDir,
    'rstest',
    'app-runtime-settings.json'
  );
  fs.writeFileSync(runtimeSettingsPath, JSON.stringify({
    schemaVersion: 1,
    generation,
    testTimeout: 45000,
    hookTimeout: 15000,
    maxConcurrency: 2,
    retry: 2,
    clearMocks: true,
    env: { FEATURE: 'enabled' },
    coverage: {
      schemaVersion: 1,
      generation: coverageGeneration,
      enabled: true,
      provider: 'istanbul',
      root: context.appDir,
      include: [],
      exclude: [],
      allowExternal: false,
      artifactRoot: coverageRoot,
    },
  }));
  const runtimeManifest = path.join(workersRoot, 'server-1-files.json');
  fs.writeFileSync(runtimeManifest, JSON.stringify([runtimeFile]));
  context.worker = {
    id: 'server-1',
    index: 0,
    total: 1,
    payload: {
      schemaVersion: 1,
      generation,
      runtimeFiles: [runtimeFile],
      runtimeManifest,
      runtimeSettingsPath,
      resultPath: path.join(workersRoot, 'server-1-result.json'),
      coveragePath: path.join(coverageRoot, 'worker-server-1.json'),
    },
  };
  let installs = 0;
  let starts = 0;
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() { installs += 1; },
    startRstestProcess() { starts += 1; },
  });

  await provider.validate();
  const plan = await provider.prepare();
  assert.equal(plan.mode, 'meteor-host');
  assert.deepEqual(plan.buildPluginOptions.rspack.targets, {
    client: false,
    server: true,
  });
  assert.equal(
    plan.buildPluginOptions.rspack.context.runtimeManifest,
    runtimeManifest
  );
  assert.equal(
    plan.buildPluginOptions.rspack.context.runtimeSettingsPath,
    runtimeSettingsPath,
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(runtimeManifest, 'utf8')), [
    runtimeFile,
  ]);
  assert.equal(plan.metadata.worker.resultPath, context.worker.payload.resultPath);
  assert.equal(plan.metadata.worker.coveragePath, context.worker.payload.coveragePath);

  const updates = [];
  const preHost = await provider.startBeforeHost({
    updateMetadata(metadata) { updates.push({ ...metadata }); },
  });
  assert.equal(preHost.exitCode, 0);
  assert.equal(plan.metadata.testTimeout, 45000);
  assert.equal(plan.metadata.maxConcurrency, 2);
  assert.equal(plan.metadata.runtimeConfig.retry, 2);
  assert.equal(plan.metadata.runtimeConfig.clearMocks, true);
  assert.deepEqual(plan.metadata.runtimeConfig.env, { FEATURE: 'enabled' });
  assert.equal(plan.metadata.coverage.generation, coverageGeneration);
  assert.equal(
    plan.metadata.coverage.artifacts['worker-server-1'],
    context.worker.payload.coveragePath,
  );
  assert.equal(installs, 0);
  assert.equal(starts, 0);
  assert.equal(updates.length, 1);
});

test('native client project receives one canonical Meteor browser architecture', async t => {
  const context = createContext(t);
  context.architectures = ['os.test', 'web.browser', 'web.browser.legacy'];
  context.webArchs = ['web.browser', 'web.browser.legacy'];
  context.options.project = ['meteor-browser'];
  const browserFile = path.join(context.appDir, 'tests/rstest/browser/dom.test.js');
  fs.mkdirSync(path.dirname(browserFile), { recursive: true });
  fs.writeFileSync(browserFile, '');
  const validations = [];
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    assertRstestOptionalCapabilities(options) {
      validations.push(options);
    },
  });

  await provider.validate();
  await provider.prepare();

  assert.deepEqual(
    argumentValues(provider.nativeArgs, '--architecture'),
    ['web.browser']
  );
  assert.equal(validations.length, 1);
  assert.equal(validations[0].appDir, context.appDir);
  assert.deepEqual(validations[0].capabilities, ['browser']);
});

test('runtime tests prepare Meteor-host plan and package harness first', async t => {
  const order = [];
  let manifestOptions;
  const context = createContext(t, {
    command: 'test-packages',
    npm: {
      root: '/harness',
      autoInstall: true,
      async ensureHarnessManifest(options) {
        manifestOptions = options;
        order.push('manifest');
      },
    },
  });
  const packageTestFile = path.join(
    context.appDir,
    'package-fixture.tests.js',
  );
  fs.writeFileSync(packageTestFile, "import { test } from '@rstest/core';\n");
  context.packageTests = [{
    name: 'local-test:package-fixture',
    sourceRoot: context.appDir,
  }];
  const provider = new RstestTestRunnerProvider(context, {
    env: {
      METEOR_RSPACK_NPM_SPEC: '/repo/npm-packages/meteor-rspack',
    },
    scanNativeRstestRoots() {
      return {
        pureFiles: [],
        runtimeFiles: ['package-runtime.test.js'],
        externalFiles: [],
        legacyFiles: [],
      };
    },
    async ensureRstestInstalled() {
      order.push('dependencies');
    },
    assertRstestOptionalCapabilities({ appDir, capabilities }) {
      order.push('optional');
      assert.equal(appDir, context.appDir);
      assert.deepEqual(capabilities, ['meteor-client']);
    },
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.deepEqual(order, ['manifest', 'dependencies', 'optional']);
  assert.equal(plan.mode, 'meteor-host');
  assert.equal(plan.driverPackage, 'rstest');
  assert.equal(plan.metadata.runtime, true);
  assert.equal(plan.metadata.command, 'test-packages');
  assert.deepEqual(plan.harnessPackages, ['ecmascript']);
  assert.equal(plan.refreshProjectMetadata, true);
  assert.deepEqual(manifestOptions, {
    additionalDevDependencies: {
      '@meteorjs/rspack': '/repo/npm-packages/meteor-rspack',
    },
    persistMeteorConfig: {
      mainModule: {
        client: '_build/test/client-meteor.js',
        server: '_build/test/server-meteor.js',
      },
    },
  });
  assert.equal(plan.buildPluginOptions.rspack.lifecycle, 'runtime');
  assert.equal(plan.buildPluginOptions.rspack.context.testRunner, 'rstest');
  assert.equal(
    plan.buildPluginOptions.rspack.projectRoot,
    context.harnessRoot,
  );
  assert.deepEqual(plan.buildPluginOptions.rspack.targets, {
    client: true,
    server: true,
  });
  const manifest = JSON.parse(fs.readFileSync(
    plan.buildPluginOptions.rspack.context.runtimeManifest,
    'utf8',
  ));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(
    manifest.discoveryRoot,
    path.join(context.harnessRoot, '.rstest-package-runtime'),
  );
  assert.equal(manifest.testFileRoot, '');
  assert.equal(
    plan.buildPluginOptions.rspack.context.runtimeSettingsPath,
    provider.runtimeSettingsPath,
  );
  assert.equal(manifest.serverFiles.length, 1);
  assert.equal(manifest.clientFiles.length, 1);
  assert.equal(
    manifest.serverFiles[0],
    path.join(
      context.harnessRoot,
      '.rstest-package-runtime',
      'package-fixture',
      'package-fixture.tests.js',
    ),
  );
  assert.match(
    fs.readFileSync(manifest.serverFiles[0], 'utf8'),
    /package-fixture\.tests\.js/,
  );
  assert.equal(
    fs.existsSync(path.join(context.harnessRoot, '_build/test/server-meteor.js')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(context.harnessRoot, '_build/test/client-meteor.js')),
    true,
  );
});

test('auto-install opt-out never invokes dependency installer', async t => {
  const context = createContext(t, {
    npm: {
      root: '/harness',
      autoInstall: false,
      async ensureHarnessManifest() {},
    },
  });
  let installs = 0;
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {
      installs += 1;
    },
  });

  await provider.validate();
  const plan = await provider.prepare();
  assert.equal(installs, 0);
  assert.equal(plan.buildPluginOptions.rspack.autoInstall, false);
});

test('package command accepts coverage for unified finalization', async t => {
  const context = createContext(t, { command: 'test-packages' });
  const packageTestFile = path.join(context.appDir, 'package-fixture.tests.js');
  fs.writeFileSync(packageTestFile, "import { test } from '@rstest/core';\n");
  context.packageTests = [{
    name: 'local-test:package-fixture',
    sourceRoot: context.appDir,
  }];
  context.options.coverage = true;
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
  });

  await provider.validate();
  assert.equal(provider.selection.needsRuntime, true);
});

test('runtime coverage exposes its plan to Rspack and exact local package transforms', async t => {
  const context = createContext(t);
  const cardsRoot = path.join(context.appDir, 'packages', 'cards');
  const externalRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'meteor-rstest-external-package-')
  );
  t.after(() => fs.rmSync(externalRoot, { recursive: true, force: true }));
  const notesRoot = path.join(externalRoot, 'notes');
  const checkoutRoot = path.resolve(__dirname, '../../../..');
  const meteorRoot = path.join(checkoutRoot, 'packages', 'meteor');
  const trackerRoot = path.join(checkoutRoot, 'packages', 'tracker');
  fs.mkdirSync(cardsRoot, { recursive: true });
  fs.mkdirSync(notesRoot, { recursive: true });
  context.localPackages = [
    { name: 'cards', sourceRoot: cardsRoot, sourceKind: 'project' },
    { name: 'meteor', sourceRoot: meteorRoot, sourceKind: 'checkout' },
    { name: 'notes', sourceRoot: notesRoot, sourceKind: 'project' },
    { name: 'tracker', sourceRoot: trackerRoot, sourceKind: 'test-target' },
  ];
  context.packageTests = [{
    name: 'local-test:tracker',
    sourceRoot: trackerRoot,
    sourceKind: 'test-target',
  }];
  context.options.serverOnly = true;
  context.options.project = ['meteor-runtime-server'];
  context.options.coverage = true;
  writeRuntimeFiles(context.appDir, ['instrumented.test.js']);
  const swcPlugin = '/integration/swc-plugin-coverage-instrument.wasm';
  const babelPlugin = '/integration/babel-plugin-istanbul.js';
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    assertRstestOptionalCapabilities() {},
    resolveRstestCoverageInstrumentation() {
      return { swcPlugin, babelPlugin };
    },
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(
    plan.buildPluginOptions.rspack.context.coveragePlanPath,
    provider.coveragePlanPath,
  );
  assert.equal(
    plan.buildPluginOptions.rspack.context.coverageGeneration,
    provider.coverageGeneration,
  );
  assert.deepEqual(plan.buildPluginOptions['babel-compiler'].sourceTransforms, {
    packageRoots: {
      cards: cardsRoot,
      notes: notesRoot,
      tracker: trackerRoot,
      'local-test:tracker': trackerRoot,
    },
    includePackages: ['cards', 'notes', 'tracker', 'local-test:tracker'],
    swcPlugins: [[swcPlugin, {}]],
    babelPlugins: [[babelPlugin, { cwd: context.appDir }]],
    cacheKey: crypto.createHash('sha256')
      .update(JSON.stringify({
        schemaVersion: 1,
        generation: provider.coverageGeneration,
        planPath: provider.coveragePlanPath,
      }))
      .digest('hex'),
  });
});

test('full-app coverage instruments the app even without Meteor-runtime test files', async t => {
  const context = createContext(t);
  context.options.fullApp = true;
  context.options.project = ['meteor-e2e'];
  context.options.coverage = true;
  const testFile = path.join(context.appDir, 'tests/rstest/e2e/app.test.js');
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, "import { test } from '@rstest/core';\n");
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    assertRstestOptionalCapabilities() {},
    resolveRstestCoverageInstrumentation() {
      return {
        swcPlugin: '/integration/coverage.wasm',
        babelPlugin: '/integration/istanbul.js',
      };
    },
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(plan.metadata.runtime, false);
  assert.equal(plan.metadata.external, true);
  assert.equal(
    plan.buildPluginOptions.rspack.context.coveragePlanPath,
    provider.coveragePlanPath,
  );
  assert.equal(
    plan.buildPluginOptions.rspack.context.coverageGeneration,
    provider.coverageGeneration,
  );
});

test('mixed coverage finalizes one generation manifest and preserves exit precedence', async t => {
  async function runFinalizer(testExitCode) {
    const context = createContext(t);
    context.localPackages = [{ name: 'fixture', sourceRoot: context.appDir }];
    context.options.serverOnly = true;
    context.options.project = ['meteor-runtime-server'];
    context.options.coverage = true;
    writeRuntimeFiles(context.appDir, ['coverage.test.js']);
    const calls = [];
    const provider = new RstestTestRunnerProvider(context, {
      async ensureRstestInstalled() {},
      assertRstestOptionalCapabilities() {},
      resolveRstestCoverageInstrumentation() {
        return {
          swcPlugin: '/integration/coverage.wasm',
          babelPlugin: '/integration/istanbul.js',
        };
      },
      startRstestProcess({ args }) {
        calls.push(args);
        const finalizerIndex = args.indexOf('--coverage-finalize-manifest');
        if (finalizerIndex !== -1) {
          return {
            completion: Promise.resolve(1),
            async stop() {},
          };
        }
        const settingsFlag = args.includes('--runtime-plan-output')
          ? '--runtime-plan-output'
          : '--runtime-settings-output';
        const settingsPath = args[args.indexOf(settingsFlag) + 1];
        const settingsGeneration = args[
          args.indexOf('--runtime-settings-generation') + 1
        ];
        const coveragePlanPath = args[args.indexOf('--coverage-plan-output') + 1];
        const coverageGeneration = args[args.indexOf('--coverage-generation') + 1];
        const artifactRoot = path.dirname(coveragePlanPath);
        fs.mkdirSync(artifactRoot, { recursive: true });
        const coverage = {
          schemaVersion: 1,
          generation: coverageGeneration,
          enabled: true,
          provider: 'istanbul',
          root: context.appDir,
          include: [],
          exclude: [],
          allowExternal: false,
          artifactRoot,
        };
        fs.writeFileSync(coveragePlanPath, JSON.stringify(coverage));
        fs.writeFileSync(settingsPath, JSON.stringify({
          schemaVersion: 1,
          generation: settingsGeneration,
          testTimeout: 30000,
          hookTimeout: 10000,
          maxConcurrency: 5,
          coverage,
        }));
        return {
          completion: Promise.resolve(0),
          async stop() {},
        };
      },
    });

    await provider.validate();
    await provider.prepare();
    assert.equal(fs.statSync(provider.coverageRoot).mode & 0o777, 0o700);
    const preHost = await provider.startBeforeHost({ updateMetadata() {} });
    assert.equal(preHost.exitCode, 0);
    const completion = { exitCode: testExitCode, outcome: testExitCode ? 'failed' : 'completed' };
    const [first, second] = await Promise.all([
      provider.completeRun(completion),
      provider.completeRun(completion),
    ]);
    const finalizerCalls = calls.filter(args =>
      args.includes('--coverage-finalize-manifest')
    );
    assert.equal(finalizerCalls.length, 1);
    const manifestPath = finalizerCalls[0][
      finalizerCalls[0].indexOf('--coverage-finalize-manifest') + 1
    ];
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(fs.statSync(manifestPath).mode & 0o777, 0o600);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.appRoot, context.appDir);
    assert.deepEqual(manifest.localPackages, context.localPackages);
    assert.equal(manifest.testExitCode, testExitCode);
    assert.deepEqual(manifest.artifacts.map(artifact => artifact.producer), [
      'server',
    ]);
    assert.equal(path.basename(path.dirname(manifest.artifacts[0].path)), manifest.generation);
    return { first, second };
  }

  assert.deepEqual(await runFinalizer(0), {
    first: { exitCode: 1 },
    second: { exitCode: 1 },
  });
  assert.deepEqual(await runFinalizer(2), {
    first: undefined,
    second: undefined,
  });
});

test('mixed runs allocate coverage paths only when coverage was requested', async t => {
  const context = createContext(t);
  context.options.serverOnly = true;
  context.options.project = ['meteor-runtime-server'];
  context.options.coverage = false;
  writeRuntimeFiles(context.appDir, ['without-coverage.test.js']);
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    assertRstestOptionalCapabilities() {},
  });

  await provider.validate();
  const plan = await provider.prepare();

  assert.equal(provider.coverageGeneration, null);
  assert.equal(provider.coverageRoot, null);
  assert.equal(provider.runtimePlanArgs.includes('--coverage-plan-output'), false);
  assert.equal(provider.runtimePlanArgs.includes('--coverage-generation'), false);
  assert.equal('coveragePlanPath' in plan.buildPluginOptions.rspack.context, false);
  assert.equal('babel-compiler' in plan.buildPluginOptions, false);
});

test('requested mixed coverage fails completion when its plan is missing', async t => {
  const context = createContext(t);
  context.options.serverOnly = true;
  context.options.project = ['meteor-runtime-server'];
  context.options.coverage = true;
  writeRuntimeFiles(context.appDir, ['missing-plan.test.js']);
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    assertRstestOptionalCapabilities() {},
    startRstestProcess: settingsWriter([]),
    warn() {},
  });

  await provider.validate();
  await provider.prepare();
  assert.equal((await provider.startBeforeHost({ updateMetadata() {} })).exitCode, 0);
  assert.deepEqual(await provider.completeRun({
    exitCode: 0,
    outcome: 'completed',
  }), { exitCode: 1 });
});

test('finalizer startup and completion errors preserve the original test exit', async t => {
  async function completeWithFailure(mode, testExitCode) {
    const context = createContext(t);
    context.options.serverOnly = true;
    context.options.project = ['meteor-runtime-server'];
    context.options.coverage = true;
    writeRuntimeFiles(context.appDir, [`${mode}-${testExitCode}.test.js`]);
    const provider = new RstestTestRunnerProvider(context, {
      async ensureRstestInstalled() {},
      assertRstestOptionalCapabilities() {},
      warn() {},
      startRstestProcess({ args }) {
        if (args.includes('--coverage-finalize-manifest')) {
          if (mode === 'startup') throw new Error('finalizer startup failed');
          return {
            completion: Promise.reject(new Error('finalizer completion failed')),
            async stop() {},
          };
        }
        writeCoverageSettings({ args, context });
        return { completion: Promise.resolve(0), async stop() {} };
      },
    });
    await provider.validate();
    await provider.prepare();
    assert.equal((await provider.startBeforeHost({ updateMetadata() {} })).exitCode, 0);
    return provider.completeRun({
      exitCode: testExitCode,
      outcome: testExitCode === 0 ? 'completed' : 'failed',
    });
  }

  for (const mode of ['startup', 'completion']) {
    assert.deepEqual(await completeWithFailure(mode, 0), { exitCode: 1 });
    assert.equal(await completeWithFailure(mode, 2), undefined);
  }
});

test('private manifest writer rejects payloads above 64 MiB', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filename = path.join(root, 'generation', 'manifest.json');
  const oversized = 'x'.repeat(64 * 1024 * 1024);

  assert.throws(() => writePrivateJsonAtomic(filename, { oversized }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_OVERSIZED');
    return true;
  });
  assert.equal(fs.existsSync(filename), false);
});

test('private manifest writer rejects symlink parents and raced destinations', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outside = path.join(root, 'outside');
  const linked = path.join(root, 'linked');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, linked);
  assert.throws(() => writePrivateJsonAtomic(
    path.join(linked, 'generation', 'manifest.json'),
    { schemaVersion: 1 },
  ), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_PATH_MISMATCH');
    return true;
  });

  const filename = path.join(root, 'generation', 'manifest.json');
  const sentinel = '{"sentinel":true}';
  const originalRename = fs.renameSync;
  const originalLink = fs.linkSync;
  const originalSpawn = childProcess.spawnSync;
  const raceDestination = (oldPath, newPath, operation) => {
    if (path.resolve(newPath) === path.resolve(filename) &&
        !fs.existsSync(filename)) {
      fs.writeFileSync(filename, sentinel);
    }
    return operation(oldPath, newPath);
  };
  fs.renameSync = (oldPath, newPath) => raceDestination(
    oldPath,
    newPath,
    originalRename,
  );
  fs.linkSync = (oldPath, newPath) => raceDestination(
    oldPath,
    newPath,
    originalLink,
  );
  childProcess.spawnSync = function patchedSpawn(...args) {
    if (args[2] && args[2].cwd && !fs.existsSync(filename)) {
      fs.writeFileSync(filename, sentinel);
    }
    return originalSpawn.apply(this, args);
  };
  t.after(() => {
    fs.renameSync = originalRename;
    fs.linkSync = originalLink;
    childProcess.spawnSync = originalSpawn;
  });
  assert.throws(() => writePrivateJsonAtomic(filename, { schemaVersion: 1 }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPLAY');
    return true;
  });
  assert.equal(fs.readFileSync(filename, 'utf8'), sentinel);
});

test('private manifest publication rejects a coordinated parent swap', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const generationRoot = path.join(root, 'generation');
  const originalRoot = path.join(root, 'generation-original');
  const outsideRoot = path.join(root, 'outside');
  const filename = path.join(generationRoot, 'manifest.json');
  fs.mkdirSync(outsideRoot);
  const originalLink = fs.linkSync;
  const originalSpawn = childProcess.spawnSync;
  let swapped = false;
  const redirect = () => {
    swapped = true;
    fs.renameSync(generationRoot, originalRoot);
    fs.symlinkSync(outsideRoot, generationRoot);
  };
  const restore = () => {
    fs.unlinkSync(generationRoot);
    fs.renameSync(originalRoot, generationRoot);
  };
  fs.linkSync = function patchedLink(oldPath, newPath) {
    if (path.resolve(newPath) === path.resolve(filename)) {
      originalLink(oldPath, path.join(outsideRoot, path.basename(oldPath)));
      redirect();
      const result = originalLink(oldPath, newPath);
      restore();
      return result;
    }
    return originalLink(oldPath, newPath);
  };
  childProcess.spawnSync = function patchedSpawn(...args) {
    if (args[2] && args[2].cwd && !swapped) {
      redirect();
      const result = originalSpawn.apply(this, args);
      restore();
      return result;
    }
    return originalSpawn.apply(this, args);
  };
  t.after(() => {
    fs.linkSync = originalLink;
    childProcess.spawnSync = originalSpawn;
  });

  assert.throws(() => writePrivateJsonAtomic(filename, { schemaVersion: 1 }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_PATH_MISMATCH');
    return true;
  });
  assert.equal(swapped, true);
  assert.equal(fs.existsSync(filename), false);
  assert.equal(fs.existsSync(path.join(outsideRoot, 'manifest.json')), false);
});

test('native-only coverage remains on the upstream Rstest lifecycle', async t => {
  const context = createContext(t);
  context.options.coverage = true;
  const testFile = path.join(
    context.appDir,
    'tests/rstest/pure/server/native-coverage.test.js',
  );
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, '');
  const calls = [];
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    assertRstestOptionalCapabilities() {},
    startRstestProcess({ args }) {
      calls.push(args);
      return { completion: Promise.resolve(0), async stop() {} };
    },
  });

  await provider.validate();
  const plan = await provider.prepare();
  assert.equal(plan.mode, 'native-only');
  assert.ok(provider.nativeArgs.includes('--coverage'));
  assert.equal(provider.nativeArgs.includes('--coverage-artifact'), false);
  assert.equal(await provider.completeRun({ exitCode: 0, outcome: 'completed' }), undefined);
  assert.equal(calls.length, 0);
});

test('full-app coverage declares server, client, and E2E artifacts before host start', async t => {
  const context = createContext(t);
  context.options.fullApp = true;
  context.options.project = ['meteor-e2e'];
  context.options.coverage = true;
  const testFile = path.join(context.appDir, 'tests/rstest/e2e/app.test.js');
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, "import { test } from '@rstest/core';\n");
  const provider = new RstestTestRunnerProvider(context, {
    async ensureRstestInstalled() {},
    assertRstestOptionalCapabilities() {},
  });

  await provider.validate();
  await provider.prepare();

  assert.ok(provider.runtimePlanArgs.includes('--coverage-plan-output'));
  assert.deepEqual(provider.coverageArtifacts.map(artifact => artifact.producer), [
    'server',
    'client',
    'e2e',
  ]);
});

test('provider cleanup stops resources once in reverse start order', async t => {
  const calls = [];
  const context = createContext(t);
  const provider = new RstestTestRunnerProvider(context);
  provider.resources.push(
    { async stop() { calls.push('native'); } },
    { async stop() { calls.push('browser'); } },
    { async stop() { calls.push('external'); } },
  );

  await provider.stop();
  await provider.stop();
  assert.deepEqual(calls, ['external', 'browser', 'native']);
});

test('build plugin registers lazy provider without environment install checks', () => {
  const registrations = [];
  const pluginPath = require.resolve('../plugin.js');
  delete require.cache[pluginPath];
  global.Plugin = {
    registerTestRunner(registration, factory) {
      registrations.push({ registration, factory });
    },
  };
  try {
    require(pluginPath);
  } finally {
    delete global.Plugin;
    delete require.cache[pluginPath];
  }

  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0].registration, {
    id: 'rstest',
    apiVersion: 1,
    activationPackages: ['rstest'],
    incompatiblePackages: [{
      name: 'tinytest',
      driverPackage: 'test-in-browser',
    }, {
      name: 'meteortesting:mocha',
      driverPackage: 'meteortesting:mocha',
    }],
  });
  assert.equal(typeof registrations[0].factory, 'function');
});
