import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

const Items = new Mongo.Collection('smokeItems');

Meteor.methods({
  'smoke.echo'(value) {
    return { echoed: value };
  },
});

Meteor.publish('smoke.items', function () {
  return Items.find();
});

Meteor.startup(async () => {
  if ((await Items.find().countAsync()) === 0) {
    await Items.insertAsync({ name: 'smoke' });
  }
});
