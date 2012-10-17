(function () {
  // XXX support options.requestPermissions as we do for Facebook, Google, Github
  Meteor.loginWithWeibo = function (options, callback) {
    // support both (options, callback) and (callback).
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }

    var config = Accounts.loginServiceConfiguration.findOne({service: 'weibo'});
    if (!config) {
      callback && callback(new Accounts.ConfigError("Service not configured"));
      return;
    }

    var state = Meteor.uuid();
    // XXX need to support configuring access_type and scope
    var loginUrl =
          'https://api.weibo.com/oauth2/authorize' +
          '?response_type=code' +
          '&client_id=' + config.clientId +
          '&redirect_uri=' + Meteor.absoluteUrl('_oauth/weibo?close', {replaceLocalhost: true}) +
          '&state=' + state;

    Accounts.oauth.initiateLogin(state, loginUrl, callback);
  };

}) ();
