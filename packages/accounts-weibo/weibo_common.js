if (!Meteor.accounts.weibo) {
  Meteor.accounts.weibo = {};
}

Meteor.accounts.weibo.config = function(clientId, appUrl, options) {
  Meteor.accounts.weibo._clientId = clientId;
  Meteor.accounts.weibo._appUrl = appUrl;
  Meteor.accounts.weibo._options = options || {};
};
