const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wrap } = require('../../dev_bundle/lib/node_modules/optimism');
const { createTargetPrelinkCache } = require('./target-prelink-cache.js');

const TARGET = Object.freeze({
  enabled: true, buildMode: 'production', commandName: 'build', arch: 'web.browser',
});

function fixture() {
  let calls = 0;
  const events = [];
  const cache = createTargetPrelinkCache(wrap, async input => ({ input, call: ++calls }), {
    max: 4096,
    makeCacheKey: (input, options = {}) => options.disableCache ? undefined : JSON.stringify(input),
  }, event => events.push(event));
  return { ...cache, calls: () => calls, events };
}

test('target reuses a promise until completion, then disposes only its own entries', async () => {
  const { cached, runForTarget, calls, events } = fixture();
  const globalResult = cached('same');
  const result = await runForTarget(TARGET, async () => {
    const first = cached('same');
    assert.notEqual(first, globalResult);
    await Promise.resolve();
    assert.equal(cached('same'), first);
    assert.equal(cached.size, 2);
    return first;
  });
  assert.equal(result.input, 'same');
  assert.equal(cached.size, 1);
  assert.equal(cached('same'), globalResult);
  await runForTarget(TARGET, () => cached('same'));
  assert.equal(calls(), 3);
  assert.deepEqual(events.map(event => event.event), ['scope-start', 'scope-end', 'scope-start', 'scope-end']);
});

test('development, test, run --production, and disabled experiments retain global reuse', async () => {
  for (const configuration of [
    { ...TARGET, enabled: false },
    { ...TARGET, buildMode: 'development', commandName: 'run' },
    { ...TARGET, buildMode: 'test' },
    { ...TARGET, commandName: 'run' },
    { ...TARGET, commandName: 'test' },
    { ...TARGET, commandName: undefined },
  ]) {
    const { cached, runForTarget, calls, events } = fixture();
    const first = cached('same');
    await runForTarget(configuration, () => cached('same'));
    await runForTarget(configuration, () => cached('same'));
    assert.equal(cached('same'), first);
    assert.equal(calls(), 1);
    assert.equal(events.length, 0);
  }
});

test('deploy and debug archives get scopes, with unchanged callback results', async () => {
  for (const configuration of [
    { ...TARGET, commandName: 'deploy' },
    { ...TARGET, buildMode: 'development' },
  ]) {
    const { cached, runForTarget } = fixture();
    const result = {};
    assert.equal(await runForTarget(configuration, async () => {
      await cached('archive');
      return result;
    }), result);
    assert.equal(cached.size, 0);
  }
});

test('development rebuilds reuse unchanged inputs and compute changed inputs', async () => {
  const { cached, runForTarget, calls } = fixture();
  const development = { ...TARGET, commandName: 'run', buildMode: 'development' };
  let unchanged;
  await runForTarget(development, async () => {
    unchanged = cached({ file: 'stable', hash: 'first' });
    await cached({ file: 'changed', hash: 'first' });
  });
  await runForTarget(development, async () => {
    assert.equal(cached({ file: 'stable', hash: 'first' }), unchanged);
    await cached({ file: 'changed', hash: 'second' });
  });
  assert.equal(calls(), 3);
});

test('a nested development target escapes the production scope', async () => {
  const { cached, runForTarget } = fixture();
  const globalResult = cached('same');
  await runForTarget(TARGET, async () => {
    const outer = cached('same');
    await runForTarget({ ...TARGET, buildMode: 'development', commandName: 'run' }, async () => {
      await Promise.resolve();
      assert.equal(cached('same'), globalResult);
    });
    assert.equal(cached('same'), outer);
  });
  assert.equal(cached('same'), globalResult);
});

test('nested scope cleanup restores outer reuse', async () => {
  const { cached, runForTarget } = fixture();
  await runForTarget(TARGET, async () => {
    const outer = cached('same');
    await runForTarget(TARGET, async () => {
      assert.notEqual(cached('same'), outer);
      assert.equal(cached.size, 2);
    });
    assert.equal(cached.size, 1);
    assert.equal(cached('same'), outer);
  });
  assert.equal(cached.size, 0);
});

test('concurrent same-architecture targets cannot dispose each other or global entries', async () => {
  const { cached, runForTarget, calls } = fixture();
  const globalResult = cached('same');
  const firstReady = Promise.withResolvers();
  const secondReady = Promise.withResolvers();
  const firstDone = Promise.withResolvers();
  const first = runForTarget(TARGET, async () => {
    const result = cached('same');
    firstReady.resolve();
    await secondReady.promise;
    assert.equal(cached('same'), result);
  });
  const second = runForTarget(TARGET, async () => {
    await firstReady.promise;
    const result = cached('same');
    secondReady.resolve();
    await firstDone.promise;
    assert.equal(cached('same'), result);
    assert.equal(cached.size, 2);
  });
  await first;
  firstDone.resolve();
  await second;
  assert.equal(cached.size, 1);
  assert.equal(cached('same'), globalResult);
  assert.equal(calls(), 3);
});

test('sync throws and async rejection preserve errors and dispose entries', async () => {
  for (const asynchronous of [false, true]) {
    const { cached, runForTarget } = fixture();
    const error = new Error('target failed');
    await assert.rejects(runForTarget(TARGET, () => {
      cached('failed');
      if (asynchronous) return Promise.reject(error);
      throw error;
    }), actual => actual === error);
    assert.equal(cached.size, 0);
  }
});

test('an async descendant of a closed scope cannot repopulate the cache', async () => {
  const { cached, runForTarget, calls } = fixture();
  const resume = Promise.withResolvers();
  let descendant;
  await runForTarget(TARGET, async () => {
    await cached('same');
    descendant = (async () => {
      await resume.promise;
      await cached('same');
      await cached('same');
    })();
  });
  assert.equal(cached.size, 0);
  resume.resolve();
  await descendant;
  assert.equal(cached.size, 0);
  assert.equal(calls(), 3);
});

test('disableCache stays uncached within a target', async () => {
  const { cached, runForTarget, calls } = fixture();
  await runForTarget(TARGET, async () => {
    await cached('same', { disableCache: true });
    await cached('same', { disableCache: true });
    assert.equal(cached.size, 0);
  });
  assert.equal(calls(), 2);
});
