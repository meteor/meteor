if (!Meteor.accounts.google) {
  Meteor.accounts.google = {};
  Meteor.accounts.google._requireConfigs = ['_clientId', '_appUrl'];
}

Meteor.accounts.google.config = function(clientId, appUrl, options) {
  Meteor.accounts.google._clientId = clientId;
  Meteor.accounts.google._appUrl = appUrl;
  Meteor.accounts.google._options = options;
};
