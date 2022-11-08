import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { $$UpperName$$, $$UpperName$$Collection } from './collection';

export function create(data: $$UpperName$$) {
  return $$UpperName$$Collection.insertAsync({ ...data });
}

export function update(_id: string, data: Mongo.Modifier<$$UpperName$$>) {
  return $$UpperName$$Collection.updateAsync(_id, { ...data });
}

export function remove(_id: string) {
  return $$UpperName$$Collection.removeAsync(_id);
}

export function findById(_id: string) {
  return $$UpperName$$Collection.findOneAsync(_id);
}

Meteor.methods({
  '$$UpperName$$.create': create,
  '$$UpperName$$.update': update,
  '$$UpperName$$.remove': remove,
  '$$UpperName$$.find': findById
});
