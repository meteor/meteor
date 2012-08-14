if (!Meteor.accounts.weibo) {
  Meteor.accounts.weibo = {};
  Meteor.accounts.weibo._requireConfigs = ['clientId', 'appUrl'];
}

Meteor.accounts.weibo.config = function(clientId, appUrl) {
  Meteor.accounts.weibo._clientId = clientId;
  Meteor.accounts.weibo._appUrl = appUrl;
};
