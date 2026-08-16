import { Meteor } from 'meteor/meteor';
import { packageCoverageValue } from 'meteor/rstest-e2e-fixture';
import { expect, test } from '@rstest/core';
import { clientCoverageValue } from '../../../../imports/coverage/client-target.js';

test('Meteor client executor resolves Atmosphere runtime in real browser', () => {
  expect(Meteor.isClient).toBe(true);
  expect(Meteor.isTest).toBe(true);
  if (process.env.METEOR_RSTEST_EXPECT_NO_COVERAGE === 'true') {
    expect(globalThis.__coverage__).toBeUndefined();
  }
  expect(clientCoverageValue()).toBe('Meteor client coverage target');
  expect(packageCoverageValue('client')).toBe(
    'Meteor package coverage target (client)'
  );
  expect(globalThis.__meteorRstestSetupLoaded).toBe(true);
  expect(typeof globalThis.test).toBe('function');
  expect(process.env.METEOR_RSTEST_COMMAND).toBe('test');
  expect(typeof window.localStorage).toBe('object');
  expect({
    api: '@rstest/core',
    host: Meteor.isClient ? 'meteor-client' : 'unexpected',
  }).toMatchSnapshot();
});
