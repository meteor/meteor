Spotify = {};

// Request Spotify credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on error.
Spotify.requestCredential = (options, credentialRequestCompleteCallback) => {
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  const config = ServiceConfiguration.configurations.findOne({service: 'spotify'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }

  const credentialToken = Random.secret();
  const scope = (options && options.requestPermissions) || ['user-read-email', 'user-read-private'];
  const flatScope = scope.map(encodeURIComponent).join('+');
  const loginStyle = OAuth._loginStyle('spotify', config, options);

  const loginUrl =
    'https://accounts.spotify.com/authorize' +
    `?client_id=${config.clientId}` +
    '&response_type=code' +
    `&scope=${flatScope}` +
    `&redirect_uri=${OAuth._redirectUri('spotify', config)}` +
    `&state=${OAuth._stateParam(loginStyle, credentialToken, options && options.redirectUrl)}`;

  OAuth.launchLogin({
    loginService: 'spotify',
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: {width: 900, height: 700},
  });
};
