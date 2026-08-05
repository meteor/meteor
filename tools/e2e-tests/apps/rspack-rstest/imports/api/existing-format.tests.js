import assert from 'node:assert';

describe('existing Meteor test discovery compatibility', function () {
  it('keeps unmigrated files outside tests/legacy on real Mocha', function () {
    assert.strictEqual(Meteor.isServer, true);
  });
});
