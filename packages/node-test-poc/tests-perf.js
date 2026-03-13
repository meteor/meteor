// POC: node:test parallel execution and performance features
// Equivalent to Jest's --maxWorkers, --shard
// Docs: https://nodejs.org/api/test.html#test-runner-execution-model
//
// Key features:
//   Concurrency:  describe('suite', { concurrency: 4 }, ...) or it('test', { concurrency: true })
//   Sharding:     SERVER_NODE_OPTIONS='--test-shard=1/3'  (run shard 1 of 3)
//   Timeout:      it('test', { timeout: 5000 }, ...)
//
// In a Meteor CI pipeline, sharding splits tests across parallel CI jobs:
//   Job 1: SERVER_NODE_OPTIONS='--test-shard=1/3'
//   Job 2: SERVER_NODE_OPTIONS='--test-shard=2/3'
//   Job 3: SERVER_NODE_OPTIONS='--test-shard=3/3'

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Feature: concurrency within a suite ---

describe('Perf — concurrent tests', { concurrency: 4 }, () => {
  // These 4 async tests run in parallel instead of sequentially.
  // Total time ≈ 100ms instead of 400ms.

  it('async task A (100ms)', async () => {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100));
    assert.ok(Date.now() - start >= 95);
  });

  it('async task B (100ms)', async () => {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100));
    assert.ok(Date.now() - start >= 95);
  });

  it('async task C (100ms)', async () => {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100));
    assert.ok(Date.now() - start >= 95);
  });

  it('async task D (100ms)', async () => {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 100));
    assert.ok(Date.now() - start >= 95);
  });
});

// --- Feature: timeout per test ---

describe('Perf — test timeouts', () => {
  it('should complete within timeout', { timeout: 1000 }, async () => {
    await new Promise(r => setTimeout(r, 50));
    assert.ok(true);
  });

  // Uncomment to see timeout failure:
  // it('should fail due to timeout', { timeout: 50 }, async () => {
  //   await new Promise(r => setTimeout(r, 200));
  // });
});

// --- Feature: sharding demonstration ---
// These tests have distinct names so sharding splits them predictably.
// Run with --test-shard=1/3, --test-shard=2/3, --test-shard=3/3

describe('Perf — shard-friendly suites (group A)', () => {
  it('shard test A1', () => assert.ok(true));
  it('shard test A2', () => assert.ok(true));
  it('shard test A3', () => assert.ok(true));
});

describe('Perf — shard-friendly suites (group B)', () => {
  it('shard test B1', () => assert.ok(true));
  it('shard test B2', () => assert.ok(true));
  it('shard test B3', () => assert.ok(true));
});

describe('Perf — shard-friendly suites (group C)', () => {
  it('shard test C1', () => assert.ok(true));
  it('shard test C2', () => assert.ok(true));
  it('shard test C3', () => assert.ok(true));
});

// --- Feature: nested concurrency control ---

describe('Perf — mixed sequential + concurrent', () => {
  // Outer suite is sequential (default), inner suite is concurrent.
  // This mimics real-world patterns: setup → parallel tests → teardown.

  it('setup step (sequential)', () => {
    assert.ok(true, 'setup done');
  });

  describe('parallel assertions', { concurrency: 3 }, () => {
    it('check 1', async () => {
      await new Promise(r => setTimeout(r, 50));
      assert.ok(true);
    });
    it('check 2', async () => {
      await new Promise(r => setTimeout(r, 50));
      assert.ok(true);
    });
    it('check 3', async () => {
      await new Promise(r => setTimeout(r, 50));
      assert.ok(true);
    });
  });

  it('teardown step (sequential)', () => {
    assert.ok(true, 'teardown done');
  });
});
