Weibo = {};

// Request Weibo credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Weibo.requestCredential = function (options, credentialRequestCompleteCallback) {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'weibo'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }

  var credentialToken = Random.secret();
  // XXX need to support configuring access_type and scope
  var loginUrl =
        'https://api.weibo.com/oauth2/authorize' +
        '?response_type=code' +
        '&client_id=' + config.clientId +
        '&redirect_uri=' + Meteor.absoluteUrl('_oauth/weibo?close', {replaceLocalhost: true}) +
        '&state=' + credentialToken;

  OAuth.showPopup(
    loginUrl,
    _.bind(credentialRequestCompleteCallback, null, credentialToken)
  );
};
