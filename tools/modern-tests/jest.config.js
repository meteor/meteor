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
  // Use Babel to transform JavaScript files
  transform: {
    "^.+\\.js$": "babel-jest"
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
  maxWorkers: 1,
};
