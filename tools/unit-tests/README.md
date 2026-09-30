# Unit Tests

Isolated Jest environment for unit-testing Meteor `tools/` and `scripts/`.

The repo root `node_modules/` is used to build the dev bundle, which becomes the Meteor tool itself. Installing test deps (jest, swc, semver, underscore) there could pull in incompatible transitive versions (e.g. lru-cache v10 vs v5) and silently break the dev bundle build or a published Meteor release. This subfolder keeps test dependencies fully isolated so they never affect how Meteor is built or shipped.

Test files use `*.test.js` next to their source.

All commands below should be run from the repo root:

```sh
# Install dependencies (first time)
npm run install:unit

# Run all unit tests
npm run test:unit

# Run a specific test file
npm run test:unit -- tools/path/to/file.test.js

# Run tests matching a name pattern
npm run test:unit -- -t "my test name"
```
