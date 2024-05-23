// Tests for the behavior of the links collection
//
// https://guide.meteor.com/testing.html

import { Meteor } from 'meteor/meteor';
import { assert } from 'chai';
import Links from './Links.js';

if (Meteor.isServer) {
  describe('links collection', function () {
    it('insert correctly', function () {
      const linkId = Links.insert({
        title: 'meteor homepage',
        url: 'https://www.meteor.com',
      });
      const added = Links.find({ _id: linkId });
      const collectionName = added._getCollectionName();
      const count = added.count();

      assert.equal(collectionName, 'links');
      assert.equal(count, 1);
    });
  });
}
