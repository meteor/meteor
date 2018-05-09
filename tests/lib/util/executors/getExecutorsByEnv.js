const assert = require('assert');
const getExecutorsByEnv = require('../../../../lib/util/executors/getExecutorsByEnv');

const {
  PUBLIC,
  PRIVATE,
  CLIENT,
  SERVER,
  PACKAGE,
  TEST,
  NODE_MODULE,
  UNIVERSAL,
  PACKAGE_CONFIG,
  MOBILE_CONFIG,
  COMPATIBILITY,
  NON_METEOR,
} = require('../../../../lib/util/environment');

describe('getExecutorsByEnv', () => {
  it('public', () => {
    const result = getExecutorsByEnv(PUBLIC);
    assert.equal(result.size, 0);
  });
  it('private', () => {
    const result = getExecutorsByEnv(PRIVATE);
    assert.equal(result.size, 0);
  });
  it('client', () => {
    const result = getExecutorsByEnv(CLIENT);
    assert.equal(result.size, 2);
    assert.ok(result.has('browser'));
    assert.ok(result.has('cordova'));
  });
  it('server', () => {
    const result = getExecutorsByEnv(SERVER);
    assert.equal(result.size, 1);
    assert.ok(result.has('server'));
  });
  it('package', () => {
    const result = getExecutorsByEnv(PACKAGE);
    assert.equal(result.size, 0);
  });
  it('test', () => {
    const result = getExecutorsByEnv(TEST);
    assert.equal(result.size, 0);
  });
  it('node_module', () => {
    const result = getExecutorsByEnv(NODE_MODULE);
    assert.equal(result.size, 0);
  });
  it('universal', () => {
    const result = getExecutorsByEnv(UNIVERSAL);
    assert.equal(result.size, 3);
    assert.ok(result.has('browser'));
    assert.ok(result.has('server'));
    assert.ok(result.has('cordova'));
  });
  it('packageConfig', () => {
    const result = getExecutorsByEnv(PACKAGE_CONFIG);
    assert.equal(result.size, 0);
  });
  it('mobileConfig', () => {
    const result = getExecutorsByEnv(MOBILE_CONFIG);
    assert.equal(result.size, 0);
  });
  it('compatibility', () => {
    const result = getExecutorsByEnv(COMPATIBILITY);
    assert.equal(result.size, 2);
    assert.ok(result.has('cordova'));
    assert.ok(result.has('browser'));
  });
  it('nonMeteor', () => {
    const result = getExecutorsByEnv(NON_METEOR);
    assert.equal(result.size, 0);
  });
});
