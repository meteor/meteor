import { Meteor, Subscription } from 'meteor/meteor';
import { $$PascalName$$Collection } from './collection';

Meteor.publish('$$PascalName$$sByLoggedUser', function publish$$PascalName$$sByUserId(this: Subscription) {
  return $$PascalName$$Collection.find({ userId: this.userId });
});

Meteor.publish('all$$PascalName$$s', function publish$$PascalName$$s() {
  return $$PascalName$$Collection.find({});
});
