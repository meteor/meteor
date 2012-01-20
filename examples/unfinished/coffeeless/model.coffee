root = exports ? this # export Presses globally.
root.Presses = Meteor.Collection 'presses'

Meteor.publish 'presses'
