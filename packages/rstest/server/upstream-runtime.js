const {
  createUpstreamExecution,
  executeUpstreamTests,
} = require('../runtime/upstream-runtime.js');

module.exports = {
  createUpstreamServerExecution(options) {
    return createUpstreamExecution({
      ...options,
      project: 'meteor-runtime-server',
    });
  },
  executeUpstreamServerTests(options) {
    return executeUpstreamTests({
      ...options,
      project: 'meteor-runtime-server',
    });
  },
};
