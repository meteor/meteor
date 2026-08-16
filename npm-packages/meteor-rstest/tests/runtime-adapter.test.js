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

test('runtime adapter accepts Meteor CLI name-filter strings', async t => {
  const { createMeteorRstestFileRuntime } = await import(
    consumerRequire.resolve('@meteorjs/rstest/runtime')
  );
  const runtime = await createMeteorRstestFileRuntime(runtimeOptions({
    testPath: 'imports/name-filter.test.js',
    testNamePattern: '^selected case$',
  }));
  t.after(() => runtime.dispose());

  const result = await runtime.collectAndRun(async () => {
    const { test } = await import('@rstest/core/internal/browser-runtime');
    test('selected case', () => {});
    test('other case', () => {});
  });

  assert.deepEqual(
    result.results.map(item => [item.name, item.status]),
    [
      ['selected case', 'pass'],
      ['other case', 'skip'],
    ],
  );
});

test('runtime adapter applies projected file-level retry configuration', async t => {
  const { createMeteorRstestFileRuntime } = await import(
    consumerRequire.resolve('@meteorjs/rstest/runtime')
  );
  const runtime = await createMeteorRstestFileRuntime(runtimeOptions({
    testPath: 'imports/retry-config.test.js',
    retry: 1,
  }));
  t.after(() => runtime.dispose());
  let attempts = 0;

  const result = await runtime.collectAndRun(async () => {
    const { expect, test } = await import(
      '@rstest/core/internal/browser-runtime'
    );
    test('uses config retry', ({ task }) => {
      attempts += 1;
      if (attempts === 1) throw new Error('retry from config');
      expect(task.retryCount).toBe(1);
    });
  });

  assert.equal(result.status, 'pass', JSON.stringify(result, null, 2));
  assert.equal(attempts, 2);
});

test('runtime adapter applies projected globals and environment', async t => {
  const { createMeteorRstestFileRuntime } = await import(
    consumerRequire.resolve('@meteorjs/rstest/runtime')
  );
  const runtime = await createMeteorRstestFileRuntime(runtimeOptions({
    testPath: 'imports/projected-config.test.js',
    globals: true,
    env: { METEOR_RSTEST_PROJECTED: 'yes' },
  }));
  t.after(() => runtime.dispose());

  const result = await runtime.collectAndRun(async () => {
    assert.equal(typeof globalThis.test, 'function');
    globalThis.test('uses projected environment', () => {
      globalThis.expect(process.env.METEOR_RSTEST_PROJECTED).toBe('yes');
    });
  });

  assert.equal(result.status, 'pass');
});

test('runtime adapter preserves upstream fixtures, hooks, context, repeats, and utilities', async t => {
  const { createMeteorRstestFileRuntime } = await import(
    consumerRequire.resolve('@meteorjs/rstest/runtime')
  );
  const runtime = await createMeteorRstestFileRuntime(runtimeOptions({
    testPath: 'imports/upstream-semantics.test.js',
  }));
  t.after(() => runtime.dispose());
  const events = [];
  let repeatRuns = 0;

  const result = await runtime.collectAndRun(async () => {
    const {
      afterAll,
      afterEach,
      beforeAll,
      beforeEach,
      describe,
      expect,
      rs,
      test,
    } = await import('@rstest/core/internal/browser-runtime');
    const fixtureTest = test.extend({
      label: async ({}, use) => {
        events.push('fixture:start');
        await use('upstream');
        events.push('fixture:end');
      },
    });

    describe.sequential('upstream contract', () => {
      beforeAll(() => { events.push('beforeAll'); });
      afterAll(() => { events.push('afterAll'); });
      beforeEach(() => { events.push('beforeEach'); });
      afterEach(() => { events.push('afterEach'); });

      fixtureTest('uses fixture and TestContext', { meta: { suite: 'runtime' } }, async ({
        label,
        task,
        expect: localExpect,
        onTestFinished,
      }) => {
        onTestFinished(() => events.push('finished'));
        localExpect(label).toBe('upstream');
        expect(task.meta.suite).toBe('runtime');
        task.meta.executor = 'meteor';

        const target = { increment(value) { return value + 1; } };
        const spy = rs.spyOn(target, 'increment');
        expect(target.increment(1)).toBe(2);
        expect(spy).toHaveBeenCalledExactlyOnceWith(1);

        let ready = false;
        Promise.resolve().then(() => { ready = true; });
        await rs.waitUntil(() => ready);
        await expect(Promise.resolve('ok')).resolves.toBe('ok');
      });

      test('honors repeats', { repeats: 1 }, () => {
        repeatRuns += 1;
        expect(repeatRuns).toBeLessThanOrEqual(2);
      });

      test('supports runtime skip', ({ skip }) => skip());
      test.todo('keeps todo semantics');
    });
  });

  assert.equal(result.status, 'pass', JSON.stringify(result, null, 2));
  assert.equal(repeatRuns, 2);
  assert.deepEqual(
    result.results.map(item => [item.name, item.status]),
    [
      ['uses fixture and TestContext', 'pass'],
      ['honors repeats', 'pass'],
      ['supports runtime skip', 'skip'],
      ['keeps todo semantics', 'todo'],
    ],
  );
  assert.equal(result.results[0].meta.executor, 'meteor');
  assert.deepEqual(events, [
    'beforeAll',
    'fixture:start',
    'beforeEach',
    'afterEach',
    'fixture:end',
    'finished',
    'beforeEach',
    'afterEach',
    'beforeEach',
    'afterEach',
    'beforeEach',
    'afterEach',
    'afterAll',
  ]);
});

test('runtime adapter delegates persistent snapshots to host environment', async () => {
  const { createMeteorRstestFileRuntime } = await import(
    consumerRequire.resolve('@meteorjs/rstest/runtime')
  );
  const snapshots = new Map();
  const snapshotEnvironment = {
    getVersion: () => '1',
    getHeader: () => '// Rstest Snapshot v1',
    resolvePath: async filepath => `${filepath}.snap`,
    resolveRawPath: async (_testPath, rawPath) => rawPath,
    saveSnapshotFile: async (filepath, content) => snapshots.set(filepath, content),
    readSnapshotFile: async filepath => snapshots.get(filepath) ?? null,
    removeSnapshotFile: async filepath => snapshots.delete(filepath),
  };
  const defineSnapshot = async runtime => runtime.collectAndRun(async () => {
    const { expect, test } = await import(
      '@rstest/core/internal/browser-runtime'
    );
    test('persistent snapshot', () => {
      expect({ value: 42 }).toMatchSnapshot();
    });
  });

  const updateRuntime = await createMeteorRstestFileRuntime(runtimeOptions({
    testPath: 'imports/persistent-snapshot.test.js',
    snapshotEnvironment,
    updateSnapshot: 'all',
  }));
  const updated = await defineSnapshot(updateRuntime);
  await updateRuntime.dispose();

  assert.equal(updated.status, 'pass');
  assert.equal(snapshots.size, 1);

  const verifyRuntime = await createMeteorRstestFileRuntime(runtimeOptions({
    testPath: 'imports/persistent-snapshot.test.js',
    snapshotEnvironment,
    updateSnapshot: 'none',
  }));
  const verified = await defineSnapshot(verifyRuntime);
  await verifyRuntime.dispose();

  assert.equal(verified.status, 'pass');
  assert.equal(verified.results[0].status, 'pass');
});
