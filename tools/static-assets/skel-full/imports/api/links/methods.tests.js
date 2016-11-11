// Tests for links methods
//
// https://guide.meteor.com/testing.html

/* eslint-env mocha */
/* eslint-disable func-names, prefer-arrow-callback */

import { Meteor } from 'meteor/meteor';
import { assert } from 'meteor/practicalmeteor:chai';
import { Links } from './links.js';
import './methods.js';

if (Meteor.isServer) {
  describe('links methods', function () {
    beforeEach(function () {
      Links.remove({});
    });

    it('can add a new link', function () {
      const addLink = Meteor.server.method_handlers['links.insert'];

      addLink.apply({}, ['meteor.com', 'https://www.meteor.com']);

      assert.equal(Links.find().count(), 1);
    });

    it('insert link method validation', function () {
      const addLink = Meteor.server.method_handlers['links.insert'];

      let errors = 0;

      // Check url is String
      try {
        addLink.apply({}, ['meteor.com', 2]);
      } catch (e) {
        errors += 1;
      }
      // Check title is String
      try {
        addLink.apply({}, [1, 'meteor.com']);
      } catch (e) {
        errors += 1;
      }
      // Check url is valid
      try {
        addLink.apply({}, ['meteor.com', 'meteor.com']);
      } catch (e) {
        errors += 1;
      }

      assert.equal(errors, 3);
    });
  });
}
