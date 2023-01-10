import { Meteor } from 'meteor/meteor';
import Links from '../collections/Links.js';

Meteor.publish('links', function () {
  return Links.find();
});
