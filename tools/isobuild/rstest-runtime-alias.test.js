const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  RSTEST_RUNTIME_SHIM,
  rstestRuntimeShimFor,
} = require('./rstest-runtime-alias.js');

test('aliases public Rstest API to official browser runtime only in Rstest host builds', () => {
  const entry = path.join(
    '/tmp',
    'app',
    'node_modules',
    '@rstest',
    'core',
    'dist',
    'index.js',
  );
  assert.equal(rstestRuntimeShimFor({
    absPath: entry,
    testRunner: 'rstest',
  }), RSTEST_RUNTIME_SHIM);
  assert.equal(rstestRuntimeShimFor({
    absPath: entry,
    testRunner: 'tinytest',
  }), null);
  assert.equal(rstestRuntimeShimFor({
    absPath: entry.replace('index.js', 'api/index.js'),
    testRunner: 'rstest',
  }), null);
});
