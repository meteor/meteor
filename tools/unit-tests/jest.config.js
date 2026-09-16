const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

module.exports = {
  rootDir: repoRoot,
  testMatch: [
    "<rootDir>/tools/**/*.test.js",
    "<rootDir>/scripts/**/*.test.js",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/tools/e2e-tests/",
    "<rootDir>/tools/tests/",
    "<rootDir>/packages/",
    "<rootDir>/.github/",
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/tools/e2e-tests/",
    "<rootDir>/tools/tests/",
    "<rootDir>/tools/static-assets/",
    "<rootDir>/npm-packages/",
    "<rootDir>/scripts/admin/",
    "<rootDir>/docs/",
    "<rootDir>/packages/non-core/",
  ],
  modulePaths: [
    path.resolve(__dirname, 'node_modules'),
  ],
  transform: {
    "^.+\\.js$": [require.resolve("@swc/jest"), {
      jsc: {
        parser: { syntax: "ecmascript" },
        target: "es2022",
      },
      module: { type: "commonjs" },
    }],
  },
  transformIgnorePatterns: ["/node_modules/"],
  testTimeout: 10_000,
  verbose: true,
};
