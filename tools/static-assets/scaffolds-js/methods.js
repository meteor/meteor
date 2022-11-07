import { Meteor } from 'meteor/meteor';
import { $$UpperName$$Collection } from './collection';

export function create$$UpperName$$(data) {
  return $$UpperName$$Collection.insertAsync({ ...data });
}

export function update$$UpperName$$(_id, data) {
  return $$UpperName$$Collection.updateAsync(_id, { ...data });
}

export function remove$$UpperName$$(_id) {
  return $$UpperName$$Collection.removeAsync(_id);
}

export function find$$UpperName$$ById(_id) {
  return $$UpperName$$Collection.findOneAsync(_id);
}

Meteor.methods({
  '$$UpperName$$.create': create$$UpperName$$,
  '$$UpperName$$.update': update$$UpperName$$,
  '$$UpperName$$.remove': remove$$UpperName$$,
  '$$UpperName$$.find': find$$UpperName$$ById
});
