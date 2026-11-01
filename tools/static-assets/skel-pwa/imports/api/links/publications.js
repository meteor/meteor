// Publications related to links

import { Meteor } from 'meteor/meteor';
import { Links } from './links.js';

Meteor.publish('links', function () {
  return Links.find({}, { sort: { createdAt: -1 }, limit: 100 });
});
