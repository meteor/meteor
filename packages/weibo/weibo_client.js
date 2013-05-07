// XXX support options.requestPermissions as we do for Facebook, Google, Github
Weibo.requestCredential = function (options, callback, loginPopupClosedCallback) {
  // support both (options, callback) and (callback).
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'weibo'});
  if (!config) {
    callback && callback(new ServiceConfiguration.ConfigError("Service not configured"));
    return;
  }

  var state = Random.id();
  // XXX need to support configuring access_type and scope
  var loginUrl =
        'https://api.weibo.com/oauth2/authorize' +
        '?response_type=code' +
        '&client_id=' + config.clientId +
        '&redirect_uri=' + Meteor.absoluteUrl('_oauth/weibo?close', {replaceLocalhost: true}) +
        '&state=' + state;

  Oauth.initiateLogin(state, loginUrl, callback, loginPopupClosedCallback);
};
