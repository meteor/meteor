import { Mongo } from 'meteor/mongo';
import { expect, test } from 'meteor/rstest';

if (process.env.METEOR_TEST_WORKER_TOTAL) {
  test('Meteor runtime worker peer owns an isolated Mongo database', async () => {
    const workerId = process.env.METEOR_TEST_WORKER_ID;
    expect(workerId).toBeTruthy();
    console.log(`[Meteor Rstest fixture] worker=${workerId}`);
    const collection = new Mongo.Collection('rstest_runtime_worker_isolation');
    const id = await collection.insertAsync({
      _id: 'shared-runtime-worker-id',
      workerId,
      value: 84,
    });
    const document = await collection.findOneAsync(id);
    expect(document.value).toBe(84);
    expect(document.workerId).toBe(workerId);
  });
}
