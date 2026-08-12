const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageRoot = path.resolve(__dirname, '..');

test('Atmosphere package publishes explicit runtime type entry', () => {
  const metadata = JSON.parse(fs.readFileSync(
    path.join(packageRoot, 'package-types.json'),
    'utf8',
  ));
  assert.deepEqual(metadata, { typesEntry: 'runtime/api.d.ts' });

  const publishedAssets = [];
  const previousPackage = global.Package;
  global.Package = {
    describe() {},
    onUse(callback) {
      callback({
        use() {},
        mainModule() {},
        addAssets(files, architecture) {
          for (const file of [].concat(files)) {
            publishedAssets.push({ file, architecture });
          }
        },
      });
    },
    registerTestRunnerPlugin() {},
  };
  try {
    delete require.cache[require.resolve('../package.js')];
    require('../package.js');
  } finally {
    global.Package = previousPackage;
  }

  assert.deepEqual(publishedAssets, [
    { file: 'runtime/api.d.ts', architecture: 'server' },
    { file: 'package-types.json', architecture: 'server' },
  ]);
});
