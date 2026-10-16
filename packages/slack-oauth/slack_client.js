Slack = {};

// Request Slack credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on error.
Slack.requestCredential = (options, credentialRequestCompleteCallback) => {
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  const config = ServiceConfiguration.configurations.findOne({service: 'slack'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }

  const credentialToken = Random.secret();
  const scope = (options && options.requestPermissions) || ['openid', 'email', 'profile'];
  const flatScope = scope.map(encodeURIComponent).join('+');
  const loginStyle = OAuth._loginStyle('slack', config, options);

  const loginUrl =
    'https://slack.com/openid/connect/authorize' +
    `?client_id=${config.clientId}` +
    '&response_type=code' +
    `&scope=${flatScope}` +
    `&redirect_uri=${OAuth._redirectUri('slack', config)}` +
    `&state=${OAuth._stateParam(loginStyle, credentialToken, options && options.redirectUrl)}`;

  OAuth.launchLogin({
    loginService: 'slack',
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: {width: 900, height: 700},
  });
};
