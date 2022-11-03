import { Meteor } from 'meteor/meteor'
import { $$UpperName$$ , $$UpperName$$Collection } from './collection';

export const save$$UpperName$$ = async (data: $$UpperName$$) => {
  return await $$UpperName$$Collection.insertAsync({ ...data });
}

export const update$$UpperName$$ = async (_id: string, data: Partial<$$UpperName$$>) => {
  return await $$UpperName$$Collection.updateAsync(_id, { ...data });
}

export const remove$$UpperName$$ = async (_id: string) => {
  return await $$UpperName$$Collection.removeAsync(_id);
}

export const find$$UpperName$$ById = async (_id: string) => {
  return await $$UpperName$$Collection.findOneAsync(_id);
}

Meteor.methods({
  save$$UpperName$$,
  update$$UpperName$$,
  remove$$UpperName$$,
  find$$UpperName$$ById
});
