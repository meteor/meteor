import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

export const twoFACollection = new Mongo.Collection('user-accounts-2fa');

if (Meteor.isServer) {
  twoFACollection.createIndex({ code: 1, userId: 1 }, { unique: true });
  twoFACollection.createIndex({ code: 1, isBackup: 1 });
}
