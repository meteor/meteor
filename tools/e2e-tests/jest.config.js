module.exports = {
  preset: 'jest-playwright-preset',
  rootDir: __dirname,
  testMatch: ["**/*.test.js"],
  testPathIgnorePatterns: ["<rootDir>/apps/"],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  verbose: true,
  // Increase timeout for CLI operations (longer on CI to absorb host contention)
  testTimeout: process.env.CI ? 240_000 : 120_000,
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
  // Playwright configuration lives in jest-playwright.config.js (the
  // jest-playwright-preset only reads from there, not from globals).
  // See that file for HEADED, SLOWMO, DEVTOOLS, RECORD toggles.
  maxWorkers: 1,
  // Force Jest to exit after all tests complete, even if there are
  // dangling async operations (e.g., orphan rspack child processes).
  // Disabled when RECORD=1 so the video flush on context.close() can complete.
  forceExit: !process.env.RECORD,
  reporters: [
    'default',
    '<rootDir>/summary-reporter.js',
  ],
};
