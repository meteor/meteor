import { Meteor } from 'meteor/meteor';
import { expect, test } from '@rstest/core';

test('Meteor client executor resolves Atmosphere runtime in real browser', () => {
  expect(Meteor.isClient).toBe(true);
  expect(Meteor.isTest).toBe(true);
  expect(globalThis.__meteorRstestSetupLoaded).toBe(true);
  expect(typeof globalThis.test).toBe('function');
  expect(process.env.METEOR_RSTEST_COMMAND).toBe('test');
  expect(typeof window.localStorage).toBe('object');
  expect({
    api: '@rstest/core',
    host: Meteor.isClient ? 'meteor-client' : 'unexpected',
  }).toMatchSnapshot();
});
