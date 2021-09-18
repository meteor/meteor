const assert = require('assert');
const {
  difference,
  union,
  intersection,
} = require('../../../../lib/util/executors/sets');

describe('executors', () => {
  describe('union', () => {
    it('unifies two sets', () => {
      const result = union(new Set(['cordova']), new Set(['client', 'server']));
      assert.equal(result.size, 3);
      assert.ok(result.has('client'));
      assert.ok(result.has('cordova'));
      assert.ok(result.has('server'));
    });
  });

  describe('difference', () => {
    it('returns the difference when b contains nothing from a', () => {
      const result = difference(
        new Set(['cordova']),
        new Set(['client', 'server'])
      );
      assert.equal(result.size, 1);
      assert.ok(result.has('cordova'));
    });

    it('returns the difference when b contains one value from a', () => {
      const result = difference(
        new Set(['client', 'cordova']),
        new Set(['client', 'server'])
      );
      assert.equal(result.size, 1);
      assert.ok(result.has('cordova'));
    });
  });

  describe('intersection', () => {
    it('returns the intersection', () => {
      const result = intersection(
        new Set(['client', 'cordova']),
        new Set(['client', 'server'])
      );
      assert.equal(result.size, 1);
      assert.ok(result.has('client'));
    });
  });
});
