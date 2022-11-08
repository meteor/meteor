import { Meteor } from 'meteor/meteor';
import { $$PascalName$$Collection } from './collection';

Meteor.publish('$$PascalName$$sByLoggedUser', function publishTasksByUserId(this) {
  return $$PascalName$$Collection.find({ userId: this.userId });
});

Meteor.publish('all$$PascalName$$s', function publishTasks() {
  return $$PascalName$$Collection.find({});
});
