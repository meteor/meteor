import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { packageCoverageValue } from 'meteor/rstest-e2e-fixture';
import { expect, test } from '@rstest/core';
import { serverCoverageValue } from '../../../../imports/coverage/server-target.js';
import { runtimeValue } from './runtime-value.js';

test('Meteor runtime project resolves Atmosphere packages', async () => {
  expect(Meteor.isTest || Meteor.isAppTest).toBe(true);
  if (process.env.METEOR_RSTEST_EXPECT_NO_COVERAGE === 'true') {
    expect(globalThis.__coverage__).toBeUndefined();
  }
  expect(serverCoverageValue()).toBe('Meteor server coverage target');
  expect(packageCoverageValue('server')).toBe(
    'Meteor package coverage target (server)'
  );
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
