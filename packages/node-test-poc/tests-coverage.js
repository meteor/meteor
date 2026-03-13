// POC: node:test native code coverage
// Run with: SERVER_NODE_OPTIONS='--experimental-test-coverage'
// Equivalent to Jest's --coverage (uses V8 coverage under the hood, same as c8/istanbul)
// Docs: https://nodejs.org/api/test.html#collecting-code-coverage
//
// Output includes:
// - Line, branch, and function coverage percentages
// - Uncovered line numbers
// - Summary table (like Istanbul/nyc)
//
// CI integration: combine with --test-reporter=lcov for machine-readable output

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Module under test (inline for POC) ---

function classifyTemperature(celsius) {
  if (celsius < 0) return 'freezing';
  if (celsius < 15) return 'cold';
  if (celsius < 25) return 'comfortable';
  if (celsius < 35) return 'warm';
  return 'hot';
}

function formatUser(user) {
  const name = user.name || 'Anonymous';
  const role = user.admin ? 'Admin' : 'User';
  const badge = user.verified ? ' ✓' : '';
  return `${role}: ${name}${badge}`;
}

function parsePort(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) throw new Error(`Invalid port: ${value}`);
    return parsed;
  }
  throw new TypeError(`Expected string or number, got ${typeof value}`);
}

// --- Tests: intentionally cover most but not all branches ---
// Coverage report will show which branches are missed

describe('Coverage — classifyTemperature', () => {
  it('should return freezing for negative', () => {
    assert.strictEqual(classifyTemperature(-10), 'freezing');
  });

  it('should return cold for 0-14', () => {
    assert.strictEqual(classifyTemperature(10), 'cold');
  });

  it('should return comfortable for 15-24', () => {
    assert.strictEqual(classifyTemperature(22), 'comfortable');
  });

  // Intentionally skip 'warm' and 'hot' — coverage will flag these
});

describe('Coverage — formatUser', () => {
  it('should format basic user', () => {
    assert.strictEqual(formatUser({ name: 'Ada' }), 'User: Ada');
  });

  it('should format admin', () => {
    assert.strictEqual(formatUser({ name: 'Bob', admin: true }), 'Admin: Bob');
  });

  it('should handle missing name', () => {
    assert.strictEqual(formatUser({}), 'User: Anonymous');
  });

  it('should show verified badge', () => {
    assert.strictEqual(formatUser({ name: 'Eve', verified: true }), 'User: Eve ✓');
  });
});

describe('Coverage — parsePort', () => {
  it('should pass through numbers', () => {
    assert.strictEqual(parsePort(3000), 3000);
  });

  it('should parse string ports', () => {
    assert.strictEqual(parsePort('8080'), 8080);
  });

  it('should throw on invalid string', () => {
    assert.throws(() => parsePort('abc'), { message: 'Invalid port: abc' });
  });

  // Intentionally skip TypeError branch — coverage will show it
});
