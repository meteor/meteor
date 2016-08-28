// Tests for links methods
//
// https://guide.meteor.com/testing.html

import { Meteor } from 'meteor/meteor';
import { chai, assert } from 'meteor/practicalmeteor:chai';
import { Links } from './links.js';
import './methods.js';

if (Meteor.isServer) {
  describe('links methods', function () {

    beforeEach(() => {
      Links.remove({});
    })

    it('can add new link', function () {
      const addLink = Meteor.server.method_handlers['links.insert'];

      addLink.apply({}, ['meteor.com', 'https://www.meteor.com']);

      assert.equal(Links.find().count(), 1);
    })
    it('insert link method validation', function () {
      const addLink = Meteor.server.method_handlers['links.insert'];

      let errors = 0;

      // Check url is String
      try {
        addLink.apply({}, ['meteor.com', 2]);
      } catch (e) {
        errors++;
      }
      // Check title is String
      try {
        addLink.apply({}, [1, 'meteor.com']);
      } catch (e) {
        errors++;
      }
      // Check url is valid
      try {
        addLink.apply({}, ['meteor.com', 'meteor.com']);
      } catch (e) {
        errors++;
      }

      assert.equal(errors, 3);
    })
  })
}
