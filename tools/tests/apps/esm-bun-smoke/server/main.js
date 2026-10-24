import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { scopedNpmDep } from 'meteor/smoke:scoped-npm-dep';

const Items = new Mongo.Collection('smokeItems');

Meteor.methods({
  'smoke.echo'(value) {
    return { echoed: value };
  },
  'smoke.scopedNpm'() {
    return scopedNpmDep;
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
