if (!Meteor.accounts.facebook) {
  Meteor.accounts.facebook = {};
}

Meteor.accounts.facebook.config = function(appId, appUrl) {
  Meteor.accounts.facebook._appId = appId;
  Meteor.accounts.facebook._appUrl = appUrl;
};


