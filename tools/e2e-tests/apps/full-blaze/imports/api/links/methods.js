// Methods related to links

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Links } from './links.js';

Meteor.methods({
  'links.insert': async function(title, url) {
    check(url, String);
    check(title, String);

    return await Links.insertAsync({
      url,
      title,
      createdAt: new Date(),
    });
  },
});
