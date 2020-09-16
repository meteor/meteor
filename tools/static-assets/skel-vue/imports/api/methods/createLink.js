import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import Links from '../collections/Links.js';

Meteor.methods({
  'createLink'(title, url) {
    check(url, String);
    check(title, String);

    return Links.insert({
      url,
      title,
      createdAt: new Date(),
    });
  },
});
