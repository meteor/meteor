module.exports = {
  preset: 'jest-playwright-preset',
  rootDir: __dirname,
  testMatch: ["**/*.test.js"],
  testPathIgnorePatterns: ["<rootDir>/apps/"],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  verbose: true,
  // Increase timeout for CLI operations. With maxWorkers>=2, two Meteor
  // dev builds + Chromium + npm install in parallel sometimes pushes the
  // first-build beforeAll past 60s on oss-vm and local machines. 180s
  // covers cold caches without masking real deadlocks.
  testTimeout: 180_000,
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
  // Phase 7: parallelism is opt-in via MODERN_TESTS_WORKERS. Default is
  // 1 so nothing changes for existing flows — the infrastructure is in
  // place (port-allocator per worker, rspack's dev-server port derived
  // from process.env.PORT, timeouts set for concurrent cold builds), so
  // setting MODERN_TESTS_WORKERS=2 at runtime is safe. CI should ramp
  // this up per matrix category after observing a canary.
  maxWorkers: process.env.MODERN_TESTS_WORKERS || 1,
};
