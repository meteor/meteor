const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveTestRunner: resolveProvider } = require('../resolve.js');

function resolveTestRunner(options) {
  return resolveProvider({
    ...options,
    discoverProviders: async () => [],
  });
}

test('app tests without a provider preserve the missing-driver route', async () => {
  assert.deepEqual(await resolveTestRunner({ command: 'test' }), {
    engine: 'driver',
    driverPackage: null,
    source: 'legacy-default',
  });
});

test('package tests without a provider preserve test-in-browser fallback', async () => {
  assert.deepEqual(await resolveTestRunner({ command: 'test-packages' }), {
    engine: 'driver',
    driverPackage: 'test-in-browser',
    source: 'legacy-default',
  });
});

test('explicit driver package preserves its exact legacy selection', async () => {
  assert.deepEqual(await resolveTestRunner({
    command: 'test',
    driverPackage: 'meteortesting:mocha',
  }), {
    engine: 'driver',
    driverPackage: 'meteortesting:mocha',
    source: '--driver-package',
  });
});
