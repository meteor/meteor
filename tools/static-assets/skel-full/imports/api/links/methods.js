// Methods related to links

import { Meteor } from 'meteor/meteor';
import { Links } from './links.js';
import { check } from 'meteor/check';

Meteor.methods({
  'links.insert'(title, url) {
    check(url, String);
    check(title, String);

    // Check if this is a valid url
    if (!url.match(/((http|https)\:\/\/)+[a-zA-Z0-9\.\/\?\:@\-_=#]+\.([a-zA-Z0-9\&\.\/\?\:@\-_=#])*/g)){
      throw new Meteor.Error('Bad url. I.e https://www.meteor.com');
    }

    return Links.insert({url, title, createdAt: new Date()});
  }
});
