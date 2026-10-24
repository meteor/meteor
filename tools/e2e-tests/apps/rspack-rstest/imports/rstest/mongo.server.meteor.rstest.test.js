import { Mongo } from 'meteor/mongo';
import { expect, test } from '@rstest/core';

test('server Meteor filename marker runs against real Mongo', async () => {
  const collection = new Mongo.Collection(null);
  const id = await collection.insertAsync({ routed: true });
  const document = await collection.findOneAsync(id);

  expect(document.routed).toBe(true);
});
