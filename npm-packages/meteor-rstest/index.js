const { defineConfig: defineRstestConfig } = require('@rstest/core');
const {
  getMeteorRstestContext,
} = require('./src/config/context.js');

function contextRequiredError() {
  const error = new Error(
    '[Meteor Rstest] Meteor-aware config factory has no Meteor context. ' +
    'Run this config through meteor test or meteor test-packages. ' +
    'Use @rstest/core defineConfig for a standalone Rstest config.'
  );
  error.code = 'METEOR_RSTEST_CONTEXT_REQUIRED';
  return error;
}

/**
 * Preserve native Rstest object configs while adapting Meteor context factories
 * to Rstest's zero-argument config-factory contract.
 */
function defineConfig(configOrFactory) {
  if (typeof configOrFactory !== 'function') {
    return defineRstestConfig(configOrFactory);
  }

  return defineRstestConfig(function meteorRstestConfigFactory() {
    const context = getMeteorRstestContext();
    if (!context) {
      throw contextRequiredError();
    }
    return configOrFactory(context);
  });
}

module.exports = defineConfig;
module.exports.defineConfig = defineConfig;
