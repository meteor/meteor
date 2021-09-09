Weibo = {};

// Request Weibo credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Weibo.requestCredential = (options, credentialRequestCompleteCallback) => {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  const config = ServiceConfiguration.configurations.findOne({service: 'weibo'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }

  const credentialToken = Random.secret();

  const loginStyle = OAuth._loginStyle('weibo', config, options);

  // XXX need to support configuring access_type and scope
  const loginUrl =
        'https://api.weibo.com/oauth2/authorize' +
        '?response_type=code' +
        `&client_id=${config.clientId}` +
        `&redirect_uri=${OAuth._redirectUri('weibo', config, null, {replaceLocalhost: true})}` +
        `&state=${OAuth._stateParam(loginStyle, credentialToken, options && options.redirectUrl)}`;

  OAuth.launchLogin({
    loginService: "weibo",
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
  });
};
