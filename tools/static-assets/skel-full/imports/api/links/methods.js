// Methods related to links

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Links } from './links.js';

Meteor.methods({
  async 'links.insert'(title, url) {
    check(url, String);
    check(title, String);

    return Links.insertAsync({
      url,
      title,
      createdAt: new Date(),
    });
  },
});
