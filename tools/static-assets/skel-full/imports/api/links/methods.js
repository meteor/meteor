// Methods related to links

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Links } from './links.js';

Meteor.methods({
  'links.insert'(title, url) {
    check(url, String);
    check(title, String);

    // Check if this is a valid url
    const re = /((http|https)\:\/\/)+[a-zA-Z0-9\.\/\?\:@\-_=#]+\.([a-zA-Z0-9\&\.\/\?\:@\-_=#])*/g;
    if (!url.match(re)) {
      throw new Meteor.Error('Invalid URL.');
    }

    return Links.insert({
      url,
      title,
      createdAt: new Date(),
    });
  },
});
