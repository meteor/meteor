const test = require('node:test');
const assert = require('node:assert');
const { isLocalDependencyInstall } = require('./should-install');

test('aborts on a local dependency install (npm lifecycle, not global, not npx)', () => {
  assert.equal(isLocalDependencyInstall({ npm_lifecycle_event: 'install' }), true);
});

test('proceeds for a global install', () => {
  assert.equal(
    isLocalDependencyInstall({ npm_lifecycle_event: 'install', npm_config_global: 'true' }),
    false
  );
});

test('proceeds for npx / npm exec', () => {
  assert.equal(isLocalDependencyInstall({ npm_lifecycle_event: 'npx' }), false);
  assert.equal(
    isLocalDependencyInstall({ npm_lifecycle_event: 'install', npm_command: 'exec' }),
    false
  );
});

test('proceeds for a direct run of the installed binary (no npm env)', () => {
  assert.equal(isLocalDependencyInstall({}), false);
});
