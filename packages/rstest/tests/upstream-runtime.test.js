const assert = require('node:assert/strict');
const test = require('node:test');

const {
  executeUpstreamServerTests,
} = require('../server/upstream-runtime.js');

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

test('upstream server executor runs sorted files and always disposes runtimes', async () => {
  const events = [];
  const createRuntime = async options => {
    events.push(`create:${options.testPath}`);
    return {
      async collectAndRun(load) {
        events.push(`load:${options.testPath}`);
        await load();
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

  const result = await executeUpstreamServerTests({
    loaders: [{
      testPath: 'imports/b.test.js',
      load: async () => events.push('module:b'),
    }, {
      testPath: 'imports/a.test.js',
      load: async () => events.push('module:a'),
    }],
    metadata: metadata(),
    createRuntime,
  });

  assert.deepEqual(events, [
    'create:imports/a.test.js',
    'load:imports/a.test.js',
    'module:a',
    'dispose:imports/a.test.js',
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
    async collectAndRun(load) {
      await load();
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

  const result = await executeUpstreamServerTests({
    loaders: [{
      testPath: 'imports/fails.test.js',
      load: async () => { throw new Error('module load failed'); },
    }, {
      testPath: 'imports/survives.test.js',
      load: async () => {},
    }],
    metadata: metadata(),
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
