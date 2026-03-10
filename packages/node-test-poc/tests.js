import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Random } from 'meteor/random';

describe('Random (node:test POC)', () => {
  it('should generate a string id', () => {
    const id = Random.id();
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(id.length, 17);
  });

  it('should generate unique ids', () => {
    const a = Random.id();
    const b = Random.id();
    assert.notStrictEqual(a, b);
  });

  it('should respect custom length', () => {
    const id = Random.id(5);
    assert.strictEqual(id.length, 5);
  });

  it('should pick from an array', () => {
    const arr = [1, 2, 3, 4, 5];
    const choice = Random.choice(arr);
    assert.ok(arr.includes(choice));
  });
});
