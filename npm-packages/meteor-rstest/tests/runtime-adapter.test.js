const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const test = require('node:test');

const consumerRequire = createRequire(
  path.join(__dirname, 'runtime-adapter-consumer.cjs'),
);

test('runtime adapter is available through the package export', async () => {
  const runtimePath = consumerRequire.resolve('@meteorjs/rstest/runtime');
  const runtime = await import(runtimePath);

  assert.equal(typeof runtime.createMeteorRstestFileRuntime, 'function');
  assert.equal(runtime.SUPPORTED_RSTEST_VERSION, '0.11.6');
});

function runtimeOptions(overrides = {}) {
  return {
    rootPath: '/meteor-app',
    projectRoot: '/meteor-app',
    project: 'meteor-runtime-server',
    testPath: 'imports/upstream-runtime.test.js',
    testTimeout: 1000,
    hookTimeout: 1000,
    maxConcurrency: 1,
    retry: 0,
    generation: 1,
    ...overrides,
  };
}

test('runtime adapter loads then runs upstream parameterized tests and matchers', async t => {
  const { createMeteorRstestFileRuntime } = await import(
    consumerRequire.resolve('@meteorjs/rstest/runtime')
  );
  const runtime = await createMeteorRstestFileRuntime(runtimeOptions());
  t.after(() => runtime.dispose());
  let attempts = 0;

  const result = await runtime.collectAndRun(async () => {
    const { expect, rs, test } = await import(
      '@rstest/core/internal/browser-runtime'
    );

    test.each([1, 2])('value %s', value => {
      const probe = rs.fn(input => input * 2);
      expect(probe(value)).toBe(value * 2);
      expect(probe).toHaveBeenCalledExactlyOnceWith(value);
    });
    test('records retry metadata', { retry: 1 }, ({ task }) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('retry once');
      }
      expect(task.retryCount).toBe(1);
    });
  });

  assert.deepEqual(
    result.results.map(item => ({
      name: item.name,
      status: item.status,
      retryCount: item.retryCount || 0,
    })),
    [
      { name: 'value 1', status: 'pass', retryCount: 0 },
      { name: 'value 2', status: 'pass', retryCount: 0 },
      { name: 'records retry metadata', status: 'pass', retryCount: 1 },
    ],
  );
});

test('runtime adapter disposal restores timers, stubs, and owned global API', async () => {
  const { createMeteorRstestFileRuntime } = await import(
    consumerRequire.resolve('@meteorjs/rstest/runtime')
  );
  const runtime = await createMeteorRstestFileRuntime(
    runtimeOptions({ testPath: 'imports/disposal.test.js' }),
  );
  const fixedTime = Date.parse('2026-08-15T00:00:00.000Z');

  await runtime.collectAndRun(async () => {
    const { expect, rs, test } = await import(
      '@rstest/core/internal/browser-runtime'
    );
    test('leaves state for adapter cleanup', () => {
      rs.useFakeTimers();
      rs.setSystemTime(fixedTime);
      rs.stubGlobal('__meteorRstestProbe', 'stubbed');
      expect(Date.now()).toBe(fixedTime);
      expect(globalThis.__meteorRstestProbe).toBe('stubbed');
    });
  });

  assert.equal(typeof globalThis.RSTEST_API, 'object');
  await runtime.dispose();

  assert.notEqual(Date.now(), fixedTime);
  assert.equal('__meteorRstestProbe' in globalThis, false);
  assert.equal('RSTEST_API' in globalThis, false);
});
