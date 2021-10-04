const assert = require('assert');
const getExecutors = require('../../../../lib/util/executors/getExecutors');
const { UNIVERSAL } = require('../../../../lib/util/environment');

describe('getExecutors', () => {
  it('returns executors for no ancestors', () => {
    const result = getExecutors(UNIVERSAL, []);
    assert.equal(result.size, 3);
    assert.ok(result.has('server'));
    assert.ok(result.has('browser'));
    assert.ok(result.has('cordova'));
  });
});
