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

test('file loader registry exposes one bundle-owned runtime factory', () => {
  const registry = createFileLoaderRegistry();
  const factory = async () => {};

  registry.setRuntimeFactory(factory);
  assert.equal(registry.getRuntimeFactory(), factory);
  assert.throws(
    () => registry.setRuntimeFactory(async () => {}),
    /runtime factory is already registered/,
  );
});
