(function () {
  Meteor.loginWithWeibo = function (callback) {
    var config = Meteor.accounts.configuration.findOne({service: 'weibo'});
    if (!config) {
      callback && callback(new Meteor.accounts.ConfigError("Service not configured"));
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

    Meteor.accounts.oauth.initiateLogin(state, loginUrl, callback);
  };

}) ();
