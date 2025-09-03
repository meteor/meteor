import { Meteor } from 'meteor/meteor';
import assert from 'assert';

describe('typescript', function () {
  it('package.json has correct name', async function () {
    const { name } = await import('../package.json');
    assert.strictEqual(name, 'typescript');
  });

  it('server is not client', function () {
    assert.strictEqual(Meteor.isClient, false);
  });
});
