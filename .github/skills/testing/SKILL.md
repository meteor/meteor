---
name: testing
description: Use when writing tests, debugging test failures, running the test suite, or setting up test infrastructure. Covers self-test, package tests, and modern E2E tests.
---

# Testing

Test patterns, commands, and utilities for the Meteor codebase.

## Test Commands

```bash
# CLI self-tests
./meteor self-test                           # Run all CLI tests
./meteor self-test "test name"               # Run specific test
./meteor self-test --list                    # List available tests
./meteor self-test --exclude "^[a-b]"        # Exclude tests by regex
./meteor self-test --retries 0               # Skip retries in development

# Package tests (TinyTest — view results at http://localhost:3000)
./meteor test-packages                       # Test all core packages
./meteor test-packages mongo                 # Test specific package
TINYTEST_FILTER="collection" ./meteor test-packages  # Filter specific tests

# Package tests in console (headless via Puppeteer)
PUPPETEER_DOWNLOAD_PATH=~/.npm/chromium ./packages/test-in-console/run.sh

# Modern E2E tests (Jest + Playwright)
npm run install:modern                       # Install dependencies
npm run test:modern                          # Run all E2E tests
npm run test:modern -- -t="React"            # Run specific test
```

## Modern E2E Tests (`tools/modern-tests/`)

Jest + Playwright suite for verifying modern bundler integrations (rspack). Tests cover framework skeletons and build scenarios.

**Test apps:** `apps/{react,vue,svelte,solid,blaze,typescript,babel,coffeescript,monorepo}`

## Test Helpers Package (`packages/test-helpers`)

Comprehensive testing utilities for Meteor applications.

### Async Testing

```javascript
import { testAsyncMulti, simplePoll, waitUntil } from 'meteor/test-helpers';

// Wait for condition
await waitUntil(() => someCondition, { timeout: 5000, interval: 100 });

// Poll until ready
simplePoll(() => isReady(), successCallback, failCallback);
```

### DOM/UI Testing

```javascript
import { clickElement, simulateEvent, canonicalizeHtml, renderToDiv } from 'meteor/test-helpers';

clickElement(button);
simulateEvent(input, 'keydown', { keyCode: 13 });
const normalized = canonicalizeHtml(html);
```

### Connection Testing

```javascript
import { makeTestConnection, captureConnectionMessages } from 'meteor/test-helpers';

const conn = makeTestConnection(clientId);
const messages = captureConnectionMessages(server);
```

### Utilities

| Function | Description |
|----------|-------------|
| `SeededRandom` | Predictable random for deterministic tests |
| `try_all_permutations()` | Test all permutations of inputs |
| `withCallbackLogger()` | Track callback invocations |
| `mockBehaviours()` | Behavior mocking |

## Tinytest (`packages/tinytest`)

Meteor's built-in test framework.

```javascript
Tinytest.add('my test', function (test) {
  test.equal(1 + 1, 2);
  test.isTrue(true);
  test.throws(function () { throw new Error(); });
});

Tinytest.addAsync('async test', async function (test) {
  const result = await asyncOperation();
  test.equal(result, expected);
});
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TEST_METADATA` | Test configuration JSON |
| `METEOR_TEST_PACKAGES` | Packages to test |

## Debug Commands

```bash
# Verbose build output
METEOR_DEBUG_BUILD=1 ./meteor run

# Profile build performance
METEOR_PROFILE=1 ./meteor build

# Force rebuild
./meteor reset && ./meteor run

# Debug Meteor tool with Chrome inspector
TOOL_NODE_FLAGS="--inspect-brk" ./meteor
```

## Writing Package Tests

In `package.js`:

```javascript
Package.onTest(function(api) {
  api.use(['tinytest', 'test-helpers', 'my-package']);
  api.addFiles('my-package-tests.js');
});
```

In `my-package-tests.js`:

```javascript
import { MyPackage } from 'meteor/my-package';

Tinytest.add('MyPackage - basic functionality', function (test) {
  const result = MyPackage.doSomething();
  test.equal(result, expected);
});
```
