Clicks = Meteor.Collection('clicks');

if (Meteor.is_server) {
  Meteor.publish('clicks', {});
}
