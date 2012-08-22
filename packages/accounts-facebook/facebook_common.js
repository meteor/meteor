if (!Meteor.accounts.facebook) {
  Meteor.accounts.facebook = {};
  Meteor.accounts.facebook._requireConfigs = ['_appId', '_appUrl'];
}

Meteor.accounts.facebook.config = function(appId, appUrl, options) {
  Meteor.accounts.facebook._appId = appId;
  Meteor.accounts.facebook._appUrl = appUrl;
  Meteor.accounts.facebook._options = options;
};


