Twitch = {};

// Request Twitch credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on error.
Twitch.requestCredential = (options, credentialRequestCompleteCallback) => {
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  const config = ServiceConfiguration.configurations.findOne({service: 'twitch'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }

  const credentialToken = Random.secret();
  const scope = (options && options.requestPermissions) || ['user:read:email'];
  const flatScope = scope.map(encodeURIComponent).join('+');
  const loginStyle = OAuth._loginStyle('twitch', config, options);

  const loginUrl =
    'https://id.twitch.tv/oauth2/authorize' +
    `?client_id=${config.clientId}` +
    '&response_type=code' +
    `&scope=${flatScope}` +
    `&redirect_uri=${OAuth._redirectUri('twitch', config)}` +
    `&state=${OAuth._stateParam(loginStyle, credentialToken, options && options.redirectUrl)}`;

  OAuth.launchLogin({
    loginService: 'twitch',
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: {width: 900, height: 600},
  });
};
