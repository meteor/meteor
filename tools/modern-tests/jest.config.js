module.exports = {
  preset: 'jest-playwright-preset',
  rootDir: __dirname,
  testMatch: ["**/*.test.js"],
  testPathIgnorePatterns: ["<rootDir>/apps/"],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  verbose: true,
  // Increase timeout for CLI operations
  testTimeout: 60_000,
  // Transform ES modules in node_modules
  transformIgnorePatterns: [
    "/node_modules/(?!(execa|wait-on|is-docker|is-stream|human-signals|merge-stream|npm-run-path|onetime|mimic-fn|strip-final-newline|path-key|shebug-command|shebug-regex)/)"
  ],
  transform: {
    "^.+\\.js$": ["@swc/jest", {
      jsc: {
        parser: { syntax: "ecmascript" },
        target: "es2022",
      },
      module: { type: "commonjs" },
    }],
  },
  // Playwright configuration
  globals: {
    'jest-playwright': {
      browsers: ['chromium'],
      launchOptions: {
        headless: true,
      }
    }
  },
  // CI stays single-worker until Phase 7 opts in explicitly via
  // MODERN_TESTS_WORKERS. Locally, '50%' gives a reasonable default that
  // uses the port-allocator's per-worker ranges without overwhelming the
  // machine (Chromium + Meteor dev-mode per worker is heavy).
  maxWorkers: process.env.MODERN_TESTS_WORKERS
    || (process.env.CI ? 1 : '50%'),
};
