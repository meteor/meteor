import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Random } from 'meteor/random';

describe('test-in-node driver contract', () => {
  it('runs a sync test with assert', () => {
    assert.strictEqual(1 + 1, 2);
  });
  it('resolves a meteor/* import through isobuild', () => {
    assert.equal(typeof Random.id(), 'string');
  });
  it('runs an async test', async () => {
    assert.strictEqual(await Promise.resolve(42), 42);
  });
});
