const { createRegistry } = require('./registry.js');
const { createFileLoaderRegistry } = require('./file-loaders.js');

const registry = createRegistry();
const fileLoaders = createFileLoaderRegistry();

module.exports = {
  registry,
  afterAll: registry.afterAll,
  afterEach: registry.afterEach,
  beforeAll: registry.beforeAll,
  beforeEach: registry.beforeEach,
  describe: registry.describe,
  expect: registry.expect,
  registerTestFileLoader: fileLoaders.register,
  registerTestFile: registry.registerTestFile,
  takeTestFileLoaders: fileLoaders.take,
  test: registry.test,
};
