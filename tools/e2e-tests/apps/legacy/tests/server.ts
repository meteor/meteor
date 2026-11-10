import assert from 'assert';
import { Meteor } from 'meteor/meteor';

describe('legacy app server', function () {
  it('runs its configured server test module', async function () {
    const { name } = await import('../package.json');
    assert.strictEqual(Meteor.isServer, true);
    assert.strictEqual(name, 'legacy');
  });
});
