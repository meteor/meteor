import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { expect, test } from '@rstest/core';
import { runtimeValue } from './runtime-value.js';

test('Meteor runtime project resolves Atmosphere packages', async () => {
  expect(Meteor.isTest || Meteor.isAppTest).toBe(true);
  const workerId = process.env.METEOR_TEST_WORKER_ID;
  if (process.env.METEOR_TEST_WORKER_TOTAL) {
    expect(workerId).toBeTruthy();
    console.log(`[Meteor Rstest fixture] worker=${workerId}`);
  }
  const collection = workerId
    ? new Mongo.Collection('rstest_runtime_worker_isolation')
    : new Mongo.Collection(null);
  const id = await collection.insertAsync({
    ...(workerId ? { _id: 'shared-runtime-worker-id' } : {}),
    workerId: workerId || 'singular',
    value: runtimeValue,
  });
  const document = await collection.findOneAsync(id);
  expect(document.value).toBe(42);
  expect(document.workerId).toBe(workerId || 'singular');
});
