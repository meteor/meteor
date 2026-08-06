const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveTestRunner } = require('../resolve.js');

test('app tests without a provider preserve the missing-driver route', () => {
  assert.deepEqual(resolveTestRunner({ command: 'test' }), {
    engine: 'driver',
    driverPackage: null,
    source: 'legacy-default',
  });
});

test('package tests without a provider preserve test-in-browser fallback', () => {
  assert.deepEqual(resolveTestRunner({ command: 'test-packages' }), {
    engine: 'driver',
    driverPackage: 'test-in-browser',
    source: 'legacy-default',
  });
});

test('explicit driver package preserves its exact legacy selection', () => {
  assert.deepEqual(resolveTestRunner({
    command: 'test',
    driverPackage: 'meteortesting:mocha',
  }), {
    engine: 'driver',
    driverPackage: 'meteortesting:mocha',
    source: '--driver-package',
  });
});
