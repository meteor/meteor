const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

module.exports = {
  rootDir: repoRoot,
  testMatch: [
    "<rootDir>/tools/**/*.test.js",
    "<rootDir>/scripts/**/*.test.js",
    "<rootDir>/npm-packages/meteor-rspack/**/*.test.js",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    // These tests run explicitly with Node's test runner in the Test Tools workflow.
    "<rootDir>/scripts/ci/build-test-matrix.test.js",
    "<rootDir>/scripts/ci/test-tools-cache-keys\\.test\\.js$",
    "<rootDir>/tools/e2e-tests/",
    "<rootDir>/tools/native-tests/",
    "<rootDir>/tools/tests/",
    "<rootDir>/packages/",
    "<rootDir>/.github/",
    "<rootDir>/scripts/check-type-test-coverage/",
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/tools/e2e-tests/",
    "<rootDir>/tools/native-tests/",
    "<rootDir>/tools/tests/",
    "<rootDir>/tools/static-assets/",
    // @meteorjs/rspack stays visible so its lib/*.test.js run here; the other
    // npm packages keep their own test setups.
    "<rootDir>/npm-packages/(?!meteor-rspack(?:/|$))",
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
    "^.+\\.ts$": [require.resolve("@swc/jest"), {
      jsc: {
        parser: { syntax: "typescript" },
        target: "es2022",
      },
      module: { type: "commonjs" },
    }],
  },
  transformIgnorePatterns: ["/node_modules/"],
  testTimeout: 10_000,
  verbose: true,
};
