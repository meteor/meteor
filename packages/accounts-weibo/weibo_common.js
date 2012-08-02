if (!Meteor.accounts.weibo) {
  Meteor.accounts.weibo = {};
}

Meteor.accounts.weibo.config = function(clientId, appUrl) {
  Meteor.accounts.weibo._appId = clientId;
  Meteor.accounts.weibo._appUrl = appUrl;
};
