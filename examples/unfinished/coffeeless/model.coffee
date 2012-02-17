root = exports ? this # export Presses globally.
root.Presses = new Meteor.Collection 'presses'

Meteor.publish 'presses'
