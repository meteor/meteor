import { Meteor } from 'meteor/meteor';
import { expect, test } from 'meteor/rstest';

test('Meteor client executor resolves Atmosphere runtime in real browser', () => {
  expect(Meteor.isClient).toBe(true);
  expect(Meteor.isTest).toBe(true);
  expect(typeof window.localStorage).toBe('object');
});
