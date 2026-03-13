# node-test-poc — Node.js Native Test Runner POC

Demonstrates that Node.js 22+ `node:test` covers all major testing features
without external dependencies. Each file targets a specific capability.

## Quick Start

```bash
# Run all POC tests
meteor test-packages ./packages/node-test-poc \
  --driver-package node-test-in-console \
  --once
```

## Feature Demos

### 1. Basic (tests.js)
Standard `describe`/`it` with `assert` — the baseline.

### 2. Mocking (tests-mock.js)
```bash
# No special flags needed — mocking is built-in
# Demonstrates: mock.fn(), mock.method(), mock.timers (setTimeout, setInterval, Date)
```
**Jest equivalent:** `jest.fn()`, `jest.spyOn()`, `jest.useFakeTimers()`

### 3. Code Coverage (tests-coverage.js)
```bash
SERVER_NODE_OPTIONS='--experimental-test-coverage' \
  meteor test-packages ./packages/node-test-poc \
  --driver-package node-test-in-console --once
```
Outputs line/branch/function coverage table. Intentionally leaves some branches
uncovered to show the report.

**Jest equivalent:** `jest --coverage`

### 4. Snapshot Testing (tests-snapshot.js)
```bash
# First run — generate snapshots:
SERVER_NODE_OPTIONS='--experimental-test-snapshots --test-update-snapshots' \
  meteor test-packages ...

# Subsequent runs — verify against snapshots:
SERVER_NODE_OPTIONS='--experimental-test-snapshots' \
  meteor test-packages ...
```
Snapshots stored in `.snapshot` file next to tests.

**Jest equivalent:** `expect(x).toMatchSnapshot()`

### 5. Advanced Filtering (tests-filtering.js)
```bash
# Run only "validation" tests:
SERVER_NODE_OPTIONS='--test-name-pattern="validation"' meteor test-packages ...

# Run only tests marked with it.only:
SERVER_NODE_OPTIONS='--test-only' meteor test-packages ...

# Exclude slow tests:
SERVER_NODE_OPTIONS='--test-name-pattern="^(?!.*slow)"' meteor test-packages ...
```
Also demonstrates `it.skip()`, `it.todo()`, `it.only()`.

**Jest equivalent:** `jest --testNamePattern`, `it.only()`, `it.skip()`, `it.todo()`

### 6. Performance — Parallel & Sharding (tests-perf.js)
```bash
# Parallel tests within suites (concurrency option — no flags needed)

# Sharding across CI jobs:
# Job 1: SERVER_NODE_OPTIONS='--test-shard=1/3' meteor test-packages ...
# Job 2: SERVER_NODE_OPTIONS='--test-shard=2/3' meteor test-packages ...
# Job 3: SERVER_NODE_OPTIONS='--test-shard=3/3' meteor test-packages ...
```
Demonstrates `{ concurrency: N }`, `{ timeout: ms }`, nested concurrency control.

**Jest equivalent:** `jest --maxWorkers`, `jest --shard`

### 7. Multiple & Custom Reporters (tests-reporters.js)
```bash
# TAP format:
SERVER_NODE_OPTIONS='--test-reporter=tap' meteor test-packages ...

# Dot reporter:
SERVER_NODE_OPTIONS='--test-reporter=dot' meteor test-packages ...

# JUnit XML (CI integration):
SERVER_NODE_OPTIONS='--test-reporter=junit' meteor test-packages ...

# Multiple reporters simultaneously:
SERVER_NODE_OPTIONS='--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=./results.xml' \
  meteor test-packages ...
```
Includes a custom reporter example in comments.

**Jest equivalent:** `jest --reporters`

## Feature Comparison

| Feature | node:test (Node 22+) | Jest |
|---------|---------------------|------|
| `describe`/`it`/`assert` | Built-in | Built-in |
| Mocking | `mock.fn()`, `mock.method()`, `mock.timers` | `jest.fn()`, `jest.spyOn()`, `jest.useFakeTimers()` |
| Code coverage | `--experimental-test-coverage` (V8) | `--coverage` (V8 via babel) |
| Snapshots | `t.assert.snapshot()` | `toMatchSnapshot()` |
| Filtering | `--test-name-pattern`, `skip`/`only`/`todo` | `--testNamePattern`, `skip`/`only`/`todo` |
| Parallel | `{ concurrency: N }` per suite | `--maxWorkers` (process-level) |
| Sharding | `--test-shard=N/M` | `--shard=N/M` |
| Reporters | spec, TAP, dot, JUnit, lcov, custom | jest-junit, custom |
| External deps | **Zero** | jest + babel + transformers |
| isobuild compatible | **Yes** (native `node:` imports) | **No** (own module resolution) |
