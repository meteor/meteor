import { Meteor } from 'meteor/meteor';

export const runtimeContext = {
  isAppTest: Meteor.isAppTest,
  isClient: Meteor.isClient,
  isServer: Meteor.isServer,
  isTest: Meteor.isTest,
};
