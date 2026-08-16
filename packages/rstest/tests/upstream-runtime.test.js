const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createLazyRuntimeFactory,
  createUpstreamExecution,
  executeUpstreamTests,
} = require('../runtime/upstream-runtime.js');

function metadata(overrides = {}) {
  return {
    appRoot: '/meteor-app',
    generation: 3,
    testNamePattern: null,
    testTimeout: 1000,
    hookTimeout: 1000,
    maxConcurrency: 1,
    ...overrides,
  };
}

test('lazy runtime factory resolves registration only when collection begins', async () => {
  const calls = [];
  let runtimeFactory;
  const createRuntime = createLazyRuntimeFactory(() => {
    calls.push('resolve');
    if (!runtimeFactory) throw new Error('runtime factory not registered');
    return runtimeFactory;
  });

  assert.deepEqual(calls, []);
  runtimeFactory = async options => {
    calls.push(`create:${options.testPath}`);
    return { options };
  };

  const runtime = await createRuntime({ testPath: 'package.test.js' });

  assert.deepEqual(calls, ['resolve', 'create:package.test.js']);
  assert.equal(runtime.options.testPath, 'package.test.js');
});

test('upstream execution discovers loaders only when startup begins', async () => {
  const events = [];
  let registeredLoaders = [];
  const execution = createUpstreamExecution({
    getLoaders() {
      events.push('loaders');
      return registeredLoaders;
    },
    metadata: metadata(),
    project: 'meteor-runtime-server',
    createRuntime: async () => ({
      async collect(load) {
        await load();
      },
      async run() {
        return {
          testPath: 'late-package.test.js',
          status: 'pass',
          results: [{
            name: 'late package test',
            status: 'pass',
            testPath: 'late-package.test.js',
          }],
        };
      },
      async dispose() {},
    }),
  });

  assert.deepEqual(events, []);
  registeredLoaders = [{
    testPath: 'late-package.test.js',
    load: async () => events.push('module'),
  }];

  assert.equal(execution.hasNext(), true);
  await execution.collectNext();
  await execution.runNext();

  assert.deepEqual(events, ['loaders', 'module']);
  assert.equal(execution.result().stats.passed, 1);
});

test('upstream executor projects host snapshots and runs sorted files in selected Meteor project', async () => {
  const events = [];
  const snapshotEnvironment = {};
  const createRuntime = async options => {
    assert.equal(options.snapshotEnvironment, snapshotEnvironment);
    assert.equal(options.updateSnapshot, 'all');
    events.push(`project:${options.project}`);
    events.push(`create:${options.testPath}`);
    return {
      async collect(load) {
        events.push(`load:${options.testPath}`);
        await load();
      },
      async run() {
        return {
          testPath: options.testPath,
          status: 'pass',
          results: [{
            name: `passes ${options.testPath}`,
            status: 'pass',
            testPath: options.testPath,
          }],
        };
      },
      async dispose() {
        events.push(`dispose:${options.testPath}`);
      },
    };
  };

  const result = await executeUpstreamTests({
    loaders: [{
      testPath: 'imports/b.test.js',
      load: async () => events.push('module:b'),
    }, {
      testPath: 'imports/a.test.js',
      load: async () => events.push('module:a'),
    }],
    metadata: metadata({ updateSnapshot: 'all' }),
    project: 'meteor-runtime-client',
    snapshotEnvironment,
    createRuntime,
  });

  assert.deepEqual(events, [
    'project:meteor-runtime-client',
    'create:imports/a.test.js',
    'load:imports/a.test.js',
    'module:a',
    'dispose:imports/a.test.js',
    'project:meteor-runtime-client',
    'create:imports/b.test.js',
    'load:imports/b.test.js',
    'module:b',
    'dispose:imports/b.test.js',
  ]);
  assert.deepEqual(result.stats, {
    total: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    todo: 0,
  });
});

test('upstream server executor reports one file load failure and continues', async () => {
  const disposed = [];
  const createRuntime = async options => ({
    async collect(load) {
      await load();
    },
    async run() {
      return {
        testPath: options.testPath,
        status: 'pass',
        results: [{
          name: 'surviving case',
          status: 'pass',
          testPath: options.testPath,
        }],
      };
    },
    async dispose() {
      disposed.push(options.testPath);
    },
  });

  const result = await executeUpstreamTests({
    loaders: [{
      testPath: 'imports/fails.test.js',
      load: async () => { throw new Error('module load failed'); },
    }, {
      testPath: 'imports/survives.test.js',
      load: async () => {},
    }],
    metadata: metadata(),
    project: 'meteor-runtime-server',
    createRuntime,
  });

  assert.deepEqual(disposed, [
    'imports/fails.test.js',
    'imports/survives.test.js',
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.stats, {
    total: 2,
    passed: 1,
    failed: 1,
    skipped: 0,
    todo: 0,
  });
  assert.equal(result.cases[0].fullName, 'imports/fails.test.js > <module>');
  assert.equal(result.cases[0].errors[0].message, 'module load failed');
  assert.equal(result.cases[1].name, 'surviving case');
});

test('upstream execution separates module collection from test run', async () => {
  const events = [];
  const execution = createUpstreamExecution({
    loaders: [{
      testPath: 'package.test.js',
      load: async () => events.push('module'),
    }],
    metadata: metadata(),
    project: 'meteor-runtime-server',
    createRuntime: async () => ({
      async collect(load) {
        events.push('collect');
        await load();
      },
      async run() {
        events.push('run');
        return {
          testPath: 'package.test.js',
          status: 'pass',
          results: [{
            name: 'passes after startup',
            status: 'pass',
            testPath: 'package.test.js',
          }],
        };
      },
      async dispose() {
        events.push('dispose');
      },
    }),
  });

  assert.equal(execution.hasNext(), true);
  await execution.collectNext();
  assert.deepEqual(events, ['collect', 'module']);
  await execution.runNext();
  assert.deepEqual(events, ['collect', 'module', 'run', 'dispose']);
  assert.equal(execution.hasNext(), false);
  assert.equal(execution.result().ok, true);
});
