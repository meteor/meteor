const { createRegistry } = require('./registry.js');

const registry = createRegistry();

module.exports = {
  registry,
  afterAll: registry.afterAll,
  afterEach: registry.afterEach,
  beforeAll: registry.beforeAll,
  beforeEach: registry.beforeEach,
  describe: registry.describe,
  expect: registry.expect,
  registerTestFile: registry.registerTestFile,
  test: registry.test,
};
