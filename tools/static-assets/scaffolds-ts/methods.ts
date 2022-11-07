import { Meteor } from 'meteor/meteor';
import { $$UpperName$$Type, $$UpperName$$Collection } from './collection';

export function create$$UpperName$$(data: $$UpperName$$Type) {
  return $$UpperName$$Collection.insertAsync({ ...data });
}

export function update$$UpperName$$(_id: string, data: Partial<$$UpperName$$Type>) {
  return $$UpperName$$Collection.updateAsync(_id, { ...data });
}

export function remove$$UpperName$$(_id: string) {
  return $$UpperName$$Collection.removeAsync(_id);
}

export function find$$UpperName$$ById(_id: string) {
  return $$UpperName$$Collection.findOneAsync(_id);
}

Meteor.methods({
  '$$UpperName$$.create': create$$UpperName$$,
  '$$UpperName$$.update': update$$UpperName$$,
  '$$UpperName$$.remove': remove$$UpperName$$,
  '$$UpperName$$.find': find$$UpperName$$ById
});
