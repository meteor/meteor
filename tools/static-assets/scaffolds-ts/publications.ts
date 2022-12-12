import { Meteor, Subscription } from 'meteor/meteor';
import { $$PascalName$$Collection } from './collection';

Meteor.publish('all$$PascalName$$s', function publish$$PascalName$$s() {
  return $$PascalName$$Collection.find({});
});
