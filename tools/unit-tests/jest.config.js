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
    "<rootDir>/tools/e2e-tests/",
    "<rootDir>/tools/native-tests/",
    "<rootDir>/tools/tests/",
    "<rootDir>/packages/",
    "<rootDir>/.github/",
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/tools/e2e-tests/",
    "<rootDir>/tools/native-tests/",
    "<rootDir>/tools/tests/",
    "<rootDir>/tools/static-assets/",
    // meteor-rspack ships plain CommonJS helpers that are unit-tested here, so
    // it stays visible to the module loader; the rest of npm-packages/ does not.
    // The `/|$` alternation keeps the boundary at the directory: without the
    // `$` the crawler prunes the bare directory path and finds no tests, and
    // without the `/` a sibling like meteor-rspack-tools would escape too.
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
