import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { expect, test } from 'meteor/rstest';
import { packageValue } from 'meteor/rstest-e2e-fixture';

let asyncStartupComplete = Meteor.isClient;
if (Meteor.isServer) {
  Meteor.startup(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    asyncStartupComplete = true;
  });
}

test('Package.onTest keeps Isobuild and Atmosphere resolution', async () => {
  expect(Meteor.isPackageTest).toBe(true);
  expect(asyncStartupComplete).toBe(true);
  expect(packageValue()).toBe(42);
  const collection = new Mongo.Collection(null);
  const id = await collection.insertAsync({ source: 'package-test' });
  expect((await collection.findOneAsync(id)).source).toBe('package-test');
});

if (Meteor.isClient) {
  test('Package.onTest client executor runs in Meteor browser', () => {
    expect(Meteor.isClient).toBe(true);
    expect(Meteor.isPackageTest).toBe(true);
    expect(packageValue()).toBe(42);
  });
}
