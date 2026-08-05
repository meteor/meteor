import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { expect, test } from 'meteor/rstest';

test('Meteor runtime project resolves Atmosphere packages', async () => {
  expect(Meteor.isTest || Meteor.isAppTest).toBe(true);
  const collection = new Mongo.Collection(null);
  const id = await collection.insertAsync({ value: 42 });
  expect((await collection.findOneAsync(id)).value).toBe(42);
});
