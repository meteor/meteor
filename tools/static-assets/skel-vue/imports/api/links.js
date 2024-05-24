import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'

export const LinksCollection = new Mongo.Collection('links')

if (Meteor.isServer) {
  Meteor.publish('links', function () {
    return LinksCollection.find({})
  })
}
