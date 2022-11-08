import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { $$PascalName$$, $$PascalName$$Collection } from './collection';

export function create(data: $$PascalName$$) {
  return $$PascalName$$Collection.insertAsync({ ...data });
}

export function update(_id: string, data: Mongo.Modifier<$$PascalName$$>) {
  check(_id, String);
  return $$PascalName$$Collection.updateAsync(_id, { ...data });
}

export function remove(_id: string) {
  check(_id, String);
  return $$PascalName$$Collection.removeAsync(_id);
}

export function findById(_id: string) {
  check(_id, String);
  return $$PascalName$$Collection.findOneAsync(_id);
}

Meteor.methods({
  '$$PascalName$$.create': create,
  '$$PascalName$$.update': update,
  '$$PascalName$$.remove': remove,
  '$$PascalName$$.find': findById
});
