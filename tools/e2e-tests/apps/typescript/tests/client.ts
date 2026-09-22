import { Meteor } from 'meteor/meteor';
import assert from 'assert';

describe('typescript', function () {
  it('client is not server', function () {
    assert.strictEqual(Meteor.isServer, false);
  });
});
