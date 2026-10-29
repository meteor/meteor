import { Meteor } from 'meteor/meteor';
import { expect, test } from '@rstest/core';

test('Meteor runtime name filter leaves this sentinel unselected', () => {
  expect(Meteor.isServer).toBe(true);
  expect(globalThis.__meteorRstestSetupLoaded).toBe(true);
  expect(typeof globalThis.test).toBe('function');
  expect(process.env.METEOR_RSTEST_COMMAND).toBe('test');
});
