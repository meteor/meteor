(function () {
  Meteor.loginWithWeibo = function (callback) {
    var config = Accounts.configuration.findOne({service: 'weibo'});
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
