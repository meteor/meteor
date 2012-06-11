Meteor.users = new Meteor.Collection("users");

if (!Meteor.accounts) {
  Meteor.accounts = {};
}

if (!Meteor.accounts.facebook) {
  Meteor.accounts.facebook = {};
}

Meteor.accounts._loginTokens = new Meteor.Collection("accounts._loginTokens");

Meteor.accounts.facebook.setup = function(appId, appUrl) {
  Meteor.accounts.facebook._appId = appId;
  Meteor.accounts.facebook._appUrl = appUrl;
};
