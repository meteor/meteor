if (!Meteor.accounts.facebook) {
  Meteor.accounts.facebook = {};
}

Meteor.accounts.facebook.setup = function(appId, appUrl) {
  Meteor.accounts.facebook._appId = appId;
  Meteor.accounts.facebook._appUrl = appUrl;
};

Meteor.accounts.facebook.SetupError = function(description) {
  this.message = description;
};
