import assert from 'assert';
import { Meteor } from 'meteor/meteor';

describe('modern test entry', function () {
  it('loads the default client compilation and its async chunk', async function () {
    const { getBuildArch } = await import('../imports/lazy');
    assert.strictEqual(Meteor.isModern, true);
    assert.strictEqual(getBuildArch(), 'client');
  });
});
