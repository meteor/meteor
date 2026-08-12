const { defineConfig } = require('@meteorjs/rstest');

module.exports = defineConfig(context => ({
  globals: true,
  testTimeout: 30000,
  maxConcurrency: 2,
  env: {
    METEOR_RSTEST_COMMAND: context.command,
    METEOR_RSTEST_APP_ROOT: context.appRoot,
    METEOR_RSTEST_CLIENT: String(context.client),
    METEOR_RSTEST_SERVER: String(context.server),
    METEOR_RSTEST_ARCHITECTURES: context.architectures.join(','),
  },
}));
