// POC: node:test built-in mocking capabilities
// Equivalent to Jest's jest.fn(), jest.spyOn(), jest.useFakeTimers()
// Docs: https://nodejs.org/api/test.html#mocking

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('Mocking — mock.fn() (like jest.fn())', () => {
  it('should create a mock function and track calls', () => {
    const fn = mock.fn((a, b) => a + b);

    fn(1, 2);
    fn(3, 4);

    assert.strictEqual(fn.mock.callCount(), 2);
    assert.deepStrictEqual(fn.mock.calls[0].arguments, [1, 2]);
    assert.strictEqual(fn.mock.calls[0].result, 3);
    assert.deepStrictEqual(fn.mock.calls[1].arguments, [3, 4]);
    assert.strictEqual(fn.mock.calls[1].result, 7);
  });

  it('should allow changing mock implementation', () => {
    const fn = mock.fn(() => 'original');
    assert.strictEqual(fn(), 'original');

    fn.mock.mockImplementation(() => 'replaced');
    assert.strictEqual(fn(), 'replaced');

    fn.mock.restore();
    assert.strictEqual(fn(), 'original');
  });
});

describe('Mocking — mock.method() (like jest.spyOn())', () => {
  it('should spy on an object method', (t) => {
    const obj = {
      greet(name) { return `Hello, ${name}!`; },
    };

    t.mock.method(obj, 'greet');

    obj.greet('Meteor');
    obj.greet('Node');

    assert.strictEqual(obj.greet.mock.callCount(), 2);
    assert.deepStrictEqual(obj.greet.mock.calls[0].arguments, ['Meteor']);
    assert.strictEqual(obj.greet.mock.calls[0].result, 'Hello, Meteor!');
  });

  it('should replace a method and restore it', (t) => {
    const service = {
      fetchData() { return 'real-data'; },
    };

    t.mock.method(service, 'fetchData', () => 'mocked-data');
    assert.strictEqual(service.fetchData(), 'mocked-data');

    service.fetchData.mock.restore();
    assert.strictEqual(service.fetchData(), 'real-data');
  });
});

describe('Mocking — mock.timers (like jest.useFakeTimers())', () => {
  it('should control setTimeout', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    let called = false;
    setTimeout(() => { called = true; }, 5000);

    assert.strictEqual(called, false);
    t.mock.timers.tick(5000);
    assert.strictEqual(called, true);
  });

  it('should control setInterval', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });

    let count = 0;
    setInterval(() => { count++; }, 1000);

    t.mock.timers.tick(3500);
    assert.strictEqual(count, 3);
  });

  it('should control Date.now()', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2025-01-01T00:00:00Z') });

    assert.strictEqual(new Date().toISOString(), '2025-01-01T00:00:00.000Z');
    t.mock.timers.tick(60_000);
    assert.strictEqual(new Date().toISOString(), '2025-01-01T00:01:00.000Z');
  });
});
