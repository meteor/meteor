const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createFileLoaderRegistry,
} = require('../runtime/file-loaders.js');

test('file loader registry returns sorted loaders once', async () => {
  const registry = createFileLoaderRegistry();
  const loadA = async () => 'a';
  const loadB = async () => 'b';

  registry.register('imports/b.test.js', loadB);
  registry.register('imports/a.test.js', loadA);

  const entries = registry.take();
  assert.deepEqual(entries.map(entry => entry.testPath), [
    'imports/a.test.js',
    'imports/b.test.js',
  ]);
  assert.equal(entries[0].load, loadA);
  assert.equal(entries[1].load, loadB);
  assert.deepEqual(registry.take(), []);
});

test('file loader registry rejects duplicate and unsafe test paths', () => {
  const invalidPaths = [
    '',
    '/absolute.test.js',
    '../outside.test.js',
    'imports/../outside.test.js',
    'imports\\windows.test.js',
  ];

  for (const testPath of invalidPaths) {
    const registry = createFileLoaderRegistry();
    assert.throws(
      () => registry.register(testPath, async () => {}),
      /app-relative POSIX path/,
    );
  }

  const registry = createFileLoaderRegistry();
  registry.register('imports/safe.test.js', async () => {});
  assert.throws(
    () => registry.register('imports/safe.test.js', async () => {}),
    /already registered/,
  );
  assert.throws(
    () => createFileLoaderRegistry().register('imports/safe.test.js', null),
    /loader must be a function/,
  );
});

test('file loader registry exposes latest bundle-owned runtime factory', () => {
  const registry = createFileLoaderRegistry();
  const factory = async () => {};
  const rebuiltFactory = async () => {};

  registry.setRuntimeFactory(factory);
  assert.equal(registry.getRuntimeFactory(), factory);
  registry.setRuntimeFactory(rebuiltFactory);
  assert.equal(registry.getRuntimeFactory(), rebuiltFactory);
});

test('file loader registry waits for bundle factory and at least one loader', async () => {
  const registry = createFileLoaderRegistry();
  let ready = false;
  const waiting = registry.waitUntilReady({ timeoutMs: 100 }).then(() => {
    ready = true;
  });

  registry.register('imports/runtime.test.js', async () => {});
  await Promise.resolve();
  assert.equal(ready, false);

  registry.setRuntimeFactory(async () => {});
  await waiting;
  assert.equal(ready, true);
});

test('file loader registry reports bundle readiness timeout', async () => {
  const registry = createFileLoaderRegistry();
  await assert.rejects(
    registry.waitUntilReady({ timeoutMs: 1 }),
    /runtime bundle did not register/,
  );
});
