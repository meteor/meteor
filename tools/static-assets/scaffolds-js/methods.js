import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { $$PascalName$$Collection } from './collection';

export async function create(data) {
  return $$PascalName$$Collection.insertAsync({ ...data });
}

export async function update(_id, data) {
  check(_id, String);
  return $$PascalName$$Collection.updateAsync(_id, { ...data });
}

export async function remove(_id) {
  check(_id, String);
  return $$PascalName$$Collection.removeAsync(_id);
}

export async function findById(_id) {
  check(_id, String);
  return $$PascalName$$Collection.findOneAsync(_id);
}

Meteor.methods({
  '$$PascalName$$.create': create,
  '$$PascalName$$.update': update,
  '$$PascalName$$.remove': remove,
  '$$PascalName$$.find': findById
});
