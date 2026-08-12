const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createProviderSession,
  createTestRunnerContext,
  normalizeTestRunnerVerbose,
  validateTestExecutionPlan,
} = require('../provider-contract.js');

function registration() {
  return Object.freeze({
    id: 'example',
    apiVersion: 1,
    activationPackages: Object.freeze(['example:runtime']),
  });
}

test('context is copied, deeply frozen, and rejects non-JSON values', () => {
  const input = {
    command: 'test',
    options: { once: true },
    selectedPackages: ['example:runtime'],
  };
  const context = createTestRunnerContext(input);
  input.options.once = false;

  assert.deepEqual(context, {
    command: 'test',
    options: { once: true },
    selectedPackages: ['example:runtime'],
  });
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.options), true);
  assert.equal(Object.isFrozen(context.selectedPackages), true);
  assert.throws(() => createTestRunnerContext({ metadata: { fn() {} } }), /JSON-safe/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => createTestRunnerContext(cyclic), /JSON-safe/);
});

test('test-runner verbosity normalizes supported Meteor package config forms', () => {
  assert.equal(normalizeTestRunnerVerbose({}), false);
  assert.equal(normalizeTestRunnerVerbose({}, true), true);
  assert.equal(normalizeTestRunnerVerbose({ verbose: false }, true), true);
  assert.equal(normalizeTestRunnerVerbose({ verbose: true }), true);
  assert.equal(normalizeTestRunnerVerbose({ modern: { verbose: true } }), true);
  assert.equal(normalizeTestRunnerVerbose({
    modern: { transpiler: { verbose: true } },
  }), true);
  assert.equal(normalizeTestRunnerVerbose({
    verbose: false,
    modern: { verbose: false, transpiler: { verbose: false } },
  }), false);
});

test('execution plan accepts only supported mode and JSON-safe opaque data', () => {
  assert.deepEqual(validateTestExecutionPlan({
    mode: 'meteor-host',
    driverPackage: 'example:runtime',
    metadata: { generation: 1 },
    buildPluginOptions: { rspack: { testMode: 'runtime' } },
  }), {
    mode: 'meteor-host',
    driverPackage: 'example:runtime',
    metadata: { generation: 1 },
    buildPluginOptions: { rspack: { testMode: 'runtime' } },
  });

  assert.throws(() => validateTestExecutionPlan({ mode: 'unknown' }), /mode/);
  assert.throws(
    () => validateTestExecutionPlan({ mode: 'native-only', metadata: { fn() {} } }),
    /JSON-safe/
  );
  assert.throws(
    () => validateTestExecutionPlan({
      mode: 'meteor-host',
      buildPluginOptions: { rspack: 'runtime' },
    }),
    /buildPluginOptions\.rspack/
  );
  assert.throws(
    () => validateTestExecutionPlan({
      mode: 'native-only',
      driverPackage: 'example:runtime',
    }),
    /driverPackage.*meteor-host/
  );
  assert.throws(
    () => validateTestExecutionPlan({
      mode: 'meteor-host',
      driverPackage: '',
    }),
    /driverPackage.*non-empty string/
  );
});

test('provider session validates required methods', () => {
  assert.throws(() => createProviderSession({
    registration: registration(),
    provider: { prepare: async () => ({ mode: 'native-only' }) },
    context: createTestRunnerContext({ command: 'test' }),
  }), error => {
    assert.equal(error.code, 'METEOR_TEST_RUNNER_INVALID_PROVIDER');
    assert.match(error.message, /validate/);
    return true;
  });
});

test('provider session prepares plan and preserves provider error identity', async () => {
  const expected = new Error('provider validation failed');
  expected.code = 'EXAMPLE_VALIDATION';
  let stops = 0;
  const session = createProviderSession({
    registration: registration(),
    provider: {
      async validate() {
        throw expected;
      },
      async prepare() {
        throw new Error('must not run');
      },
      async stop() {
        stops += 1;
      },
    },
    context: createTestRunnerContext({ command: 'test' }),
  });

  await assert.rejects(session.prepare(), error => error === expected);
  assert.equal(stops, 1);
  await session.stop();
  await session.stop();
  assert.equal(stops, 1);
});

test('provider session rejects malformed pre-host process handles', async () => {
  const session = createProviderSession({
    registration: registration(),
    provider: {
      async validate() {},
      async prepare() {
        return { mode: 'meteor-host' };
      },
      async startBeforeHost() {
        return { process: { completion: Promise.resolve(0) } };
      },
    },
    context: createTestRunnerContext({ command: 'test' }),
  });

  await session.prepare();
  await assert.rejects(session.startBeforeHost({}), /process\.stop/);
});

test('provider session cleans up failed generation and host hooks', async () => {
  for (const hook of ['beforeAppRun', 'startHost']) {
    const expected = new Error(`${hook} failed`);
    expected.code = `EXAMPLE_${hook.toUpperCase()}`;
    let stops = 0;
    const session = createProviderSession({
      registration: registration(),
      provider: {
        async validate() {},
        async prepare() {
          return { mode: 'meteor-host' };
        },
        async [hook]() {
          throw expected;
        },
        async stop() {
          stops += 1;
        },
      },
      context: createTestRunnerContext({ command: 'test' }),
    });

    await session.prepare();
    await assert.rejects(session[hook]({}), error => error === expected);
    assert.equal(stops, 1);
  }
});

test('provider cleanup failure never masks original lifecycle error', async () => {
  const expected = new Error('host failed');
  expected.code = 'EXAMPLE_HOST';
  const cleanupError = new Error('cleanup failed');
  const session = createProviderSession({
    registration: registration(),
    provider: {
      async validate() {},
      async prepare() {
        return { mode: 'meteor-host' };
      },
      async startHost() {
        throw expected;
      },
      async stop() {
        throw cleanupError;
      },
    },
    context: createTestRunnerContext({ command: 'test' }),
  });

  await session.prepare();
  await assert.rejects(session.startHost({}), error => {
    assert.equal(error, expected);
    assert.equal(error.cleanupError, cleanupError);
    return true;
  });
});
