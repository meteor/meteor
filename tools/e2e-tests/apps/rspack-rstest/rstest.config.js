const { defineConfig } = require('@meteorjs/rstest');
const path = require('node:path');

module.exports = defineConfig(context => {
  const reportsDirectory = process.env.METEOR_RSTEST_E2E_COVERAGE_DIR;
  const linesThreshold = process.env.METEOR_RSTEST_E2E_LINES_THRESHOLD;

  return {
    globals: true,
    setupFiles: [path.join(
      context.appRoot,
      'tests',
      'rstest',
      'runtime',
      'setup.js',
    )],
    testTimeout: 30000,
    maxConcurrency: 2,
    env: {
      METEOR_RSTEST_COMMAND: context.command,
      METEOR_RSTEST_APP_ROOT: context.appRoot,
      METEOR_RSTEST_CLIENT: String(context.client),
      METEOR_RSTEST_SERVER: String(context.server),
      METEOR_RSTEST_ARCHITECTURES: context.architectures.join(','),
      METEOR_RSTEST_EXPECT_NO_COVERAGE:
        process.env.METEOR_RSTEST_EXPECT_NO_COVERAGE || '',
    },
    ...(reportsDirectory && {
      coverage: {
        provider: 'istanbul',
        include: [
          'tests/rstest/pure/server/coverage-target.js',
          'imports/coverage/*.js',
          'packages/rstest-e2e-fixture/fixture.js',
        ],
        exclude: ['**/*.test.*'],
        reporters: ['json'],
        reportsDirectory,
        ...(linesThreshold && {
          thresholds: { lines: Number(linesThreshold) },
        }),
        reportOnFailure:
          process.env.METEOR_RSTEST_E2E_REPORT_ON_FAILURE === 'true',
      },
    }),
  };
});
