if (!Accounts.weibo) {
  Accounts.weibo = {};
  Accounts.weibo._requireConfigs = ['_clientId', '_appUrl'];
}

Accounts.weibo.config = function(clientId, appUrl) {
  Accounts.weibo._clientId = clientId;
  Accounts.weibo._appUrl = appUrl;
};
