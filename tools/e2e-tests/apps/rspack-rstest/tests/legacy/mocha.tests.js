import assert from 'node:assert';

describe('legacy Mocha compatibility route', function () {
  it('preserves callback done and Mocha this.timeout semantics', function (done) {
    this.timeout(1000);
    setTimeout(() => {
      assert.strictEqual(Meteor.isServer, true);
      done();
    }, 5);
  });
});
