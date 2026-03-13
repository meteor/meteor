// POC: node:test advanced filtering capabilities
// Equivalent to Jest's --testNamePattern, it.only, it.skip, it.todo
// Docs: https://nodejs.org/api/test.html#filtering-tests-by-name
//
// Run examples:
//   All tests:          (no special flags)
//   By name pattern:    SERVER_NODE_OPTIONS='--test-name-pattern="validation"'
//   Only tests:         SERVER_NODE_OPTIONS='--test-only'
//   Skip slow tests:    SERVER_NODE_OPTIONS='--test-name-pattern="^(?!.*slow)"'

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Feature: describe/it.skip — mark tests to skip ---

describe('Filtering — skip', () => {
  it('should run this test', () => {
    assert.ok(true);
  });

  it.skip('should be skipped (not implemented yet)', () => {
    // This test is skipped — shown as "skipped" in the report
    assert.fail('this should never run');
  });

  it('should also run', () => {
    assert.strictEqual(1 + 1, 2);
  });
});

// --- Feature: describe/it.todo — placeholder tests ---

describe('Filtering — todo', () => {
  it('should pass', () => {
    assert.ok(true);
  });

  it.todo('implement rate limiting validation');
  it.todo('add edge case for empty input');
  // todo tests show up in the report as "TODO" — great for planning
});

// --- Feature: it.only — focus on specific tests ---
// Requires: SERVER_NODE_OPTIONS='--test-only'

describe('Filtering — only (requires --test-only flag)', () => {
  it('this runs normally without --test-only', () => {
    assert.ok(true);
  });

  it.only('with --test-only flag, ONLY this test runs in this suite', () => {
    assert.ok(true);
  });

  it('this is also skipped when --test-only is set', () => {
    assert.ok(true);
  });
});

// --- Feature: --test-name-pattern filtering ---
// Tests with descriptive names for pattern matching

describe('Filtering — name patterns', () => {
  it('validation: should reject empty string', () => {
    assert.throws(() => { if (!'' ) throw new Error('empty'); });
  });

  it('validation: should reject null', () => {
    assert.throws(() => { if (null === null) throw new Error('null'); });
  });

  it('formatting: should trim whitespace', () => {
    assert.strictEqual('  hello  '.trim(), 'hello');
  });

  it('formatting: should lowercase', () => {
    assert.strictEqual('HELLO'.toLowerCase(), 'hello');
  });

  it('slow: heavy computation simulation', async () => {
    // With --test-name-pattern="^(?!.*slow)" this test is excluded
    await new Promise(r => setTimeout(r, 10));
    assert.ok(true);
  });
});
