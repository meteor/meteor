import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

describe('random', () => {
  it('generates deterministic ids with a specified seed', () => {
    const random = Random.createWithSeeds(0);
    assert.strictEqual(random.id(), 'cp9hWvhg8GSvuZ9os');
    assert.strictEqual(random.id(), '3f3k6Xo7rrHCifQhR');
    assert.strictEqual(random.id(), 'shxDnjWWmnKPEoLhM');
    assert.strictEqual(random.id(), '6QTjB8C5SEqhmz4ni');
  });

  it('generates ids in the right format', () => {
    const idLen = 17;
    assert.strictEqual(Random.id().length, idLen);
    assert.strictEqual(Random.id(29).length, 29);
    const numDigits = 9;
    const hexStr = Random.hexString(numDigits);
    assert.strictEqual(hexStr.length, numDigits);
    Number.parseInt(hexStr, 16); // should not throw
    const frac = Random.fraction();
    assert.ok(frac < 1.0);
    assert.ok(frac >= 0.0);

    assert.strictEqual(Random.secret().length, 43);
    assert.strictEqual(Random.secret(13).length, 13);
  });

  it('Alea is last resort', () => {
    if (Meteor.isServer) {
      assert.strictEqual(Random.alea, undefined);
    }
    if (Meteor.isClient) {
      const useGetRandomValues = !!(typeof window !== 'undefined' &&
          window.crypto && window.crypto.getRandomValues);
      assert.strictEqual(Random.alea === undefined, useGetRandomValues);
    }
  });

  it('createWithSeeds requires parameters', () => {
    assert.throws(() => {
      Random.createWithSeeds();
    });
  });
});
