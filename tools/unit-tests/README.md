# Unit Tests

Isolated Jest environment for unit-testing Meteor `tools/`, `scripts/`, and package logic.

The repo root `node_modules/` is used to build the dev bundle, which becomes the Meteor tool itself. Installing test deps (jest, swc, semver, underscore) there could pull in incompatible transitive versions (e.g. lru-cache v10 vs v5) and silently break the dev bundle build or a published Meteor release. This subfolder keeps test dependencies fully isolated so they never affect how Meteor is built or shipped.

Tests for `tools/` and `scripts/` use `*.test.js` next to their source.

Rspack's Jest tests live in `tools/unit-tests/rspack/`, outside Meteor's package
source discovery, and use this shared environment. Its Meteor package tests live
in `packages/rspack/rspack_tests.js` and run through Tinytest. The unit-test CI
workflow also runs when files under `packages/rspack/` change.

All commands below should be run from the repo root:

```sh
# Install dependencies (first time)
npm run install:unit

# Run all unit tests
npm run test:unit

# Run a specific test file
npm run test:unit -- tools/path/to/file.test.js

# Run the Rspack proxy unit tests
npm run test:unit -- tools/unit-tests/rspack/proxy.test.js

# Run tests matching a name pattern
npm run test:unit -- -t "my test name"
```
