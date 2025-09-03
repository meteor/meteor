// Tests for links methods
//
// https://guide.meteor.com/testing.html

import { Meteor } from 'meteor/meteor';
import { assert } from 'chai';
import { Links } from './links.js';
import './methods.js';

if (Meteor.isServer) {
  describe('links methods', function () {
    beforeEach(async function () {
      await Links.removeAsync({});
    });

    it('can add a new link', async function () {
      const addLink = Meteor.server.method_handlers['links.insert'];

      addLink.apply({}, ['meteor.com', 'https://www.meteor.com']);

      assert.equal(await Links.find().countAsync(), 1);
    });
  });
}
