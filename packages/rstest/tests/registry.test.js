const assert = require('node:assert/strict');
const test = require('node:test');

const { createRegistry } = require('../runtime/registry.js');

test('runtime registry preserves nested suite hooks and async case order', async () => {
  const registry = createRegistry();
  const events = [];

  registry.describe('Mongo integration', () => {
    registry.beforeAll(() => events.push('beforeAll'));
    registry.beforeEach(() => events.push('beforeEach'));
    registry.afterEach(() => events.push('afterEach'));
    registry.afterAll(() => events.push('afterAll'));
    registry.test('inserts document', async () => {
      await Promise.resolve();
      events.push('case');
      registry.expect({ count: 1 }).toEqual({ count: 1 });
    });
  });

  const result = await registry.run();

  assert.equal(result.ok, true);
  assert.deepEqual(events, ['beforeAll', 'beforeEach', 'case', 'afterEach', 'afterAll']);
  assert.deepEqual(result.stats, { total: 1, passed: 1, failed: 0, skipped: 0, todo: 0 });
  assert.equal(result.cases[0].fullName, 'Mongo integration > inserts document');
  assert.equal(result.cases[0].status, 'pass');
});

test('runtime registry runs concurrent cases before a sequential barrier', async () => {
  const registry = createRegistry();
  const events = [];
  let active = 0;
  let maxActive = 0;
  let started = 0;
  let release;
  const bothStarted = new Promise(resolve => {
    release = resolve;
  });

  const concurrentCase = name => registry.test.concurrent(name, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    events.push(`${name}:start`);
    started += 1;
    if (started === 2) release();
    await bothStarted;
    events.push(`${name}:end`);
    active -= 1;
  });

  concurrentCase('first');
  concurrentCase('second');
  registry.test.sequential('barrier', () => {
    assert.equal(active, 0);
    events.push('barrier');
  });

  const result = await registry.run({ testTimeout: 100 });

  assert.equal(result.ok, true);
  assert.equal(maxActive, 2);
  assert.deepEqual(events.slice(0, 2).sort(), ['first:start', 'second:start']);
  assert.equal(events.at(-1), 'barrier');
  assert.deepEqual(result.cases.map(item => item.name), [
    'first',
    'second',
    'barrier',
  ]);
});

test('concurrent suites inherit scheduling while explicit sequential cases wait', async () => {
  const registry = createRegistry();
  const hookCounts = {
    beforeAll: 0,
    beforeEach: 0,
    afterEach: 0,
    afterAll: 0,
  };
  let active = 0;
  let started = 0;
  let release;
  const bothStarted = new Promise(resolve => {
    release = resolve;
  });

  registry.describe.concurrent('shared Meteor runtime', () => {
    registry.beforeAll(() => {
      hookCounts.beforeAll += 1;
    });
    registry.beforeEach(() => {
      hookCounts.beforeEach += 1;
    });
    registry.afterEach(() => {
      hookCounts.afterEach += 1;
    });
    registry.afterAll(() => {
      hookCounts.afterAll += 1;
    });
    for (const name of ['alpha', 'beta']) {
      registry.test(name, async () => {
        active += 1;
        started += 1;
        if (started === 2) release();
        await bothStarted;
        active -= 1;
      });
    }
    registry.test.sequential('observes completed concurrent cases', () => {
      assert.equal(active, 0);
    });
  });

  const result = await registry.run({ testTimeout: 100 });

  assert.equal(result.ok, true);
  assert.equal(started, 2);
  assert.deepEqual(hookCounts, {
    beforeAll: 1,
    beforeEach: 3,
    afterEach: 3,
    afterAll: 1,
  });
  assert.deepEqual(result.cases.map(item => item.name), [
    'alpha',
    'beta',
    'observes completed concurrent cases',
  ]);
});

test('runtime maxConcurrency bounds concurrent cases and keeps failures isolated', async () => {
  const registry = createRegistry();
  const releases = [];
  let active = 0;
  let maxActive = 0;
  let started = 0;

  for (let index = 0; index < 4; index += 1) {
    registry.test.concurrent(`case ${index + 1}`, async () => {
      started += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => {
        releases[index] = resolve;
      });
      active -= 1;
      if (index === 2) throw new Error('isolated concurrent failure');
    });
  }

  const runPromise = registry.run({
    maxConcurrency: 2,
    testTimeout: 1000,
  });
  for (let attempt = 0; attempt < 20 && started < 2; attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(started, 2);
  assert.equal(maxActive, 2);
  releases[0]();
  releases[1]();
  for (let attempt = 0; attempt < 20 && started < 4; attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(started, 4);
  assert.equal(maxActive, 2);
  releases[2]();
  releases[3]();

  const result = await runPromise;

  assert.equal(result.ok, false);
  assert.deepEqual(result.cases.map(item => item.status), [
    'pass',
    'pass',
    'fail',
    'pass',
  ]);
  assert.match(result.cases[2].errors[0].message, /isolated concurrent failure/);
});

test('runtime registry attributes registered cases to their source file', async () => {
  const registry = createRegistry();

  registry.registerTestFile(
    'tests/rstest/runtime/server/mongo.test.js',
    () => {
      registry.describe('Mongo integration', () => {
        registry.test('inserts document', () => {});
      });
    },
  );
  registry.test('outside registered file', () => {});

  const result = await registry.run();
  const registered = result.cases.find(
    item => item.fullName === 'Mongo integration > inserts document',
  );
  const outside = result.cases.find(
    item => item.fullName === 'outside registered file',
  );

  assert.equal(
    registered.testPath,
    'tests/rstest/runtime/server/mongo.test.js',
  );
  assert.equal('testPath' in outside, false);
});

test('runtime registry attributes hook failures to their source file', async () => {
  const registry = createRegistry();

  registry.registerTestFile(
    'tests/rstest/runtime/server/setup.test.js',
    () => {
      registry.beforeAll(() => {
        throw new Error('file setup failed');
      });
      registry.test('blocked by setup', () => {});
    },
  );

  const result = await registry.run();
  const hookFailure = result.cases.find(item => item.name === '<beforeAll>');

  assert.equal(
    hookFailure.testPath,
    'tests/rstest/runtime/server/setup.test.js',
  );
});

test('runtime registry returns serializable failures without stopping later cases', async () => {
  const registry = createRegistry();
  registry.test('fails', () => registry.expect('meteor').toBe('rstest'));
  registry.test('still runs', () => registry.expect(true).toBeTruthy());

  const result = await registry.run();

  assert.equal(result.ok, false);
  assert.deepEqual(result.stats, { total: 2, passed: 1, failed: 1, skipped: 0, todo: 0 });
  assert.equal(result.cases[0].status, 'fail');
  assert.match(result.cases[0].errors[0].message, /Expected "meteor" to be "rstest"/);
  assert.equal(typeof result.cases[0].errors[0].stack, 'string');
  assert.equal(result.cases[1].status, 'pass');
});

test('runtime registry supports skip, todo, and promise assertions', async () => {
  const registry = createRegistry();
  registry.test.skip('skipped', () => { throw new Error('must not run'); });
  registry.test.todo('future case');
  registry.test('resolves', async () => {
    await registry.expect(Promise.resolve(42)).resolves.toBe(42);
    await registry.expect(Promise.resolve(42)).resolves.not.toBe(41);
    await registry.expect(Promise.reject(new Error('expected rejection')))
      .rejects.toThrow(/expected rejection/);
  });

  const result = await registry.run();

  assert.equal(result.ok, true);
  assert.deepEqual(result.stats, { total: 3, passed: 1, failed: 0, skipped: 1, todo: 1 });
});

test('runtime equality distinguishes Map, Set, and Error contents', () => {
  const registry = createRegistry();
  assert.throws(() => registry.expect(new Map([['value', 1]])).toEqual(
    new Map([['value', 2]]),
  ));
  assert.throws(() => registry.expect(new Set([1])).toEqual(new Set([2])));
  assert.throws(() => registry.expect(new Error('left')).toEqual(new Error('right')));
  registry.expect(new Map([['value', 1]])).toEqual(new Map([['value', 1]]));
});

test('runtime registry fails never-settling cases within configured timeout', async () => {
  const registry = createRegistry();
  const events = [];
  registry.afterEach(() => events.push('afterEach'));
  registry.test('never settles', () => new Promise(() => {}));

  const result = await registry.run({ testTimeout: 10, hookTimeout: 10 });

  assert.equal(result.ok, false);
  assert.match(result.cases[0].errors[0].message, /timed out after 10ms/);
  assert.deepEqual(events, ['afterEach']);
});

test('runtime registry applies Rstest name pattern before invoking cases', async () => {
  const registry = createRegistry();
  registry.describe('Meteor runtime', () => {
    registry.test('selected case', () => registry.expect(true).toBe(true));
    registry.test('unselected case', () => {
      throw new Error('filtered case must not execute');
    });
  });

  const result = await registry.run({ testNamePattern: '^Meteor runtime > selected' });

  assert.equal(result.ok, true);
  assert.deepEqual(result.stats, { total: 2, passed: 1, failed: 0, skipped: 1, todo: 0 });
  assert.deepEqual(result.cases.map(item => item.status), ['pass', 'skip']);
});

test('name filtering does not run hooks from suites with no selected cases', async () => {
  const registry = createRegistry();
  const events = [];
  registry.describe('unselected', () => {
    registry.beforeAll(() => events.push('unselected beforeAll'));
    registry.test('case', () => events.push('unselected case'));
  });
  registry.describe('selected', () => {
    registry.beforeAll(() => events.push('selected beforeAll'));
    registry.test('case', () => events.push('selected case'));
  });

  const result = await registry.run({ testNamePattern: '^selected > case$' });
  assert.equal(result.ok, true);
  assert.deepEqual(events, ['selected beforeAll', 'selected case']);
});

test('beforeAll failure keeps sibling suites and afterAll cleanup running', async () => {
  const registry = createRegistry();
  const events = [];
  registry.describe('broken', () => {
    registry.beforeAll(() => { throw new Error('setup failed'); });
    registry.afterAll(() => events.push('broken afterAll'));
    registry.test('skipped by setup', () => events.push('must not run'));
  });
  registry.describe('sibling', () => {
    registry.test('still runs', () => events.push('sibling case'));
  });

  const result = await registry.run();
  assert.equal(result.ok, false);
  assert.deepEqual(events, ['broken afterAll', 'sibling case']);
  assert.equal(result.cases.some(item => item.fullName === 'sibling > still runs' && item.status === 'pass'), true);
  assert.equal(result.cases.some(item => item.name === '<beforeAll>' && item.status === 'fail'), true);
});

test('runtime registry skips nested describe cases and hooks recursively', async () => {
  const registry = createRegistry();
  const events = [];
  registry.describe.skip('skipped suite', () => {
    registry.beforeAll(() => events.push('beforeAll'));
    registry.describe('nested suite', () => {
      registry.beforeEach(() => events.push('beforeEach'));
      registry.test('nested case', () => events.push('case'));
    });
  });

  const result = await registry.run();

  assert.equal(result.ok, true);
  assert.deepEqual(events, []);
  assert.deepEqual(result.stats, { total: 1, passed: 0, failed: 0, skipped: 1, todo: 0 });
  assert.equal(result.cases[0].fullName, 'skipped suite > nested suite > nested case');
});
