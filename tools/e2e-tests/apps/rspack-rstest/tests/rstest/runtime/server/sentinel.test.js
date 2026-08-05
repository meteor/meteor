import { Meteor } from 'meteor/meteor';
import { expect, test } from 'meteor/rstest';

test('Meteor runtime name filter leaves this sentinel unselected', () => {
  expect(Meteor.isServer).toBe(true);
});
