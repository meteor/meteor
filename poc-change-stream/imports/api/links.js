import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';

export const LinksCollection = new Mongo.Collection('links');

if (Meteor.isServer) {
  Meteor.methods({
    'links.insert'({ title, url }) {
      return LinksCollection.insertAsync({ title, url, createdAt: new Date() });
    },
  });
}
