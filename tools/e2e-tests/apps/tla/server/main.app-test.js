import { asyncValue } from './async-dep';
import assert from 'assert';

console.log('[tla] app test loaded');

describe('tla', function () {
  it('runs after tla settles', function () {
    assert.strictEqual(asyncValue, 'ready');
  });
});
