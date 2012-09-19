if (!Meteor.accounts.qq) {
  Meteor.accounts.qq = {};
  Meteor.accounts.qq._requireConfigs = ['_clientId', '_appUrl'];
}

Meteor.accounts.qq.config = function(clientId, appUrl) {
  Meteor.accounts.qq._clientId = clientId;
  Meteor.accounts.qq._appUrl = appUrl;
};
