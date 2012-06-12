Meteor.users = new Meteor.Collection("users");

if (!Meteor.accounts) {
  Meteor.accounts = {};
}

Meteor.accounts._loginTokens = new Meteor.Collection(
  "accounts._loginTokens",
  null /*manager*/,
  null /*driver*/,
  true /*preventAutopublish*/);
