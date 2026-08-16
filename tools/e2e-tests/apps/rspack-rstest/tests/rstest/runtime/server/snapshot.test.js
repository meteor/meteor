import { expect, test } from '@rstest/core';
import { Meteor } from 'meteor/meteor';

test('Meteor runtime supports committed snapshots', () => {
  expect({
    api: '@rstest/core',
    host: Meteor.isServer ? 'meteor-server' : 'unexpected',
  }).toMatchSnapshot();
});
