const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wrap } = require('../../../../dev_bundle/lib/node_modules/optimism');
const { POLICIES, wrapWithPolicy } = require('./cache-policies.cjs');

function fixture(policy) {
  let calls = 0;
  const cached = wrapWithPolicy(wrap, async file => ({ id: file.id, call: ++calls }), {
    max: 4096,
    makeCacheKey: (file, options) => options.disableCache
      ? undefined : JSON.stringify([file.id, file.bundleArch]),
  }, policy);
  return { cached, calls: () => calls };
}

const file = (id, bundleArch = 'web.browser', length = 4) => ({
  id, bundleArch, source: 'x'.repeat(length),
});

for (const policy of Object.values(POLICIES)) {
  test(`${policy}: reuse small entries and preserve disableCache`, async () => {
    const { cached, calls } = fixture(policy);
    const input = file(1);
    const first = cached(input, {});
    assert.equal(cached(input, {}), first);
    assert.equal((await first).id, input.id);
    await cached(input, { disableCache: true });
    await cached(input, { disableCache: true });
    assert.equal(calls(), 3);
  });
}

test('large bypass applies at the threshold, and only that policy skips large entries', async () => {
  for (const policy of Object.values(POLICIES)) {
    const { cached, calls } = fixture(policy);
    for (const length of [1024 * 1024 - 1, 1024 * 1024]) {
      const input = file(length, 'web.browser', length);
      await cached(input, {});
      await cached(input, {});
    }
    assert.equal(calls(), policy === POLICIES.BYPASS_LARGE ? 3 : 2);
  }
});

test('entry cap evicts by count while fewer large entries still remain cached', async () => {
  const { cached, calls } = fixture(POLICIES.CAP_128);
  const large = file(0, 'web.browser', 1024 * 1024);
  const first = cached(large, {});
  assert.equal(cached(large, {}), first);
  for (let id = 1; id <= 128; id++) await cached(file(id), {});
  assert.equal(cached.size, 128);
  await cached(large, {});
  assert.equal(calls(), 130);
});

test('architecture rotation preserves undefined-arch calls and evicts on a defined transition', async () => {
  const { cached, calls } = fixture(POLICIES.ROTATE_ARCH);
  const modern = file(1);
  const first = cached(modern, {});
  await cached({ ...file(2), bundleArch: undefined }, {});
  assert.equal(cached(modern, {}), first);
  await cached(file(3, 'web.browser.legacy'), {});
  await cached(modern, {});
  assert.equal(calls(), 4);
});

test('rotation can duplicate pending work but preserves each caller result', async () => {
  const releases = [];
  const cached = wrapWithPolicy(wrap, input => new Promise(resolve => {
    releases.push(() => resolve(input.id));
  }), { max: 4096, makeCacheKey: input => `${input.id}/${input.bundleArch}` }, POLICIES.ROTATE_ARCH);
  const first = cached(file(1));
  const second = cached(file(2, 'web.browser.legacy'));
  const third = cached(file(1));
  assert.equal(releases.length, 3);
  releases.forEach(release => release());
  assert.deepEqual(await Promise.all([first, second, third]), [1, 2, 1]);
});

test('unknown policy fails instead of silently running the baseline', () => {
  assert.throws(() => fixture('typo'), /Unknown cache policy/);
});
