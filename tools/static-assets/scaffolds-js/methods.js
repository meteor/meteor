import { Meteor } from 'meteor/meteor';
import { $$UpperName$$Collection } from './collection';

export function create(data) {
  return $$UpperName$$Collection.insertAsync({ ...data });
}

export function update(_id, data) {
  return $$UpperName$$Collection.updateAsync(_id, { ...data });
}

export function remove(_id) {
  return $$UpperName$$Collection.removeAsync(_id);
}

export function findById(_id) {
  return $$UpperName$$Collection.findOneAsync(_id);
}

Meteor.methods({
  '$$UpperName$$.create': create,
  '$$UpperName$$.update': update,
  '$$UpperName$$.remove': remove,
  '$$UpperName$$.find': findById
});
