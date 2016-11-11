// All links-related publications

/* eslint-disable func-names, prefer-arrow-callback */

import { Meteor } from 'meteor/meteor';
import { Links } from '../links.js';

Meteor.publish('links.all', function () {
  return Links.find();
});
