const { createFileLoaderRegistry } = require('./file-loaders.js');

const fileLoaders = createFileLoaderRegistry();

module.exports = {
  getRstestRuntimeFactory: fileLoaders.getRuntimeFactory,
  registerTestFileLoader: fileLoaders.register,
  takeTestFileLoaders: fileLoaders.take,
  setRstestRuntimeFactory: fileLoaders.setRuntimeFactory,
  waitUntilRstestRuntimeReady: fileLoaders.waitUntilReady,
};
