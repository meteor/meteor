root = exports ? this # export Presses globally.
root.Presses = new Mongo.Collection 'presses'

Meteor.publish 'presses'
