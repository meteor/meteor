// POC: node:test multiple and custom reporters
// Docs: https://nodejs.org/api/test.html#test-reporters
//
// Built-in reporters (via SERVER_NODE_OPTIONS):
//   spec (default):  SERVER_NODE_OPTIONS='--test-reporter=spec'
//   TAP:             SERVER_NODE_OPTIONS='--test-reporter=tap'
//   dot:             SERVER_NODE_OPTIONS='--test-reporter=dot'
//   JUnit XML:       SERVER_NODE_OPTIONS='--test-reporter=junit'
//   lcov (coverage): SERVER_NODE_OPTIONS='--experimental-test-coverage --test-reporter=lcov'
//
// Multiple reporters simultaneously (output to different destinations):
//   SERVER_NODE_OPTIONS='--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=./test-results.xml'
//
// Custom reporter — any module exporting a transform stream:
//   SERVER_NODE_OPTIONS='--test-reporter=./my-reporter.js'
//
// CI/CD examples:
//   GitHub Actions:  --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=test-results.xml
//   GitLab CI:       same pattern, GitLab auto-parses JUnit XML artifacts
//   Codecov:         --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage.info

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// A mix of passing, failing (commented), and skipped tests
// to show how different reporters render each state.

describe('Reporters — basic output', () => {
  it('passing test', () => {
    assert.strictEqual(2 + 2, 4);
  });

  it('another passing test', () => {
    assert.ok(true);
  });

  it.skip('skipped test');

  it.todo('planned test');
});

describe('Reporters — nested suites', () => {
  describe('inner suite A', () => {
    it('test A1', () => assert.ok(true));
    it('test A2', () => assert.ok(true));
  });

  describe('inner suite B', () => {
    it('test B1', () => assert.ok(true));
    it.skip('test B2 (skipped)');
  });
});

describe('Reporters — async tests', () => {
  it('fast async', async () => {
    await new Promise(r => setTimeout(r, 10));
    assert.ok(true);
  });

  it('medium async', async () => {
    await new Promise(r => setTimeout(r, 50));
    assert.ok(true);
  });
});

// --- Custom reporter example (for reference) ---
//
// A custom reporter is just a module that transforms the test event stream.
// Save this as `my-reporter.js`:
//
//   export default async function* reporter(source) {
//     let passed = 0, failed = 0, skipped = 0;
//     for await (const event of source) {
//       if (event.type === 'test:pass') { passed++; yield `✓ ${event.data.name}\n`; }
//       if (event.type === 'test:fail') { failed++; yield `✗ ${event.data.name}\n`; }
//       if (event.type === 'test:skip') { skipped++; }
//     }
//     yield `\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped\n`;
//   }
//
// Then: SERVER_NODE_OPTIONS='--test-reporter=./my-reporter.js'
