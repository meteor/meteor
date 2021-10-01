Github = {};

// Request Github credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Github.requestCredential = (options, credentialRequestCompleteCallback) => {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  const config = ServiceConfiguration.configurations.findOne({service: 'github'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }
  const credentialToken = Random.secret();

  const scope = (options && options.requestPermissions) || ['user:email'];
  const flatScope = scope.map(encodeURIComponent).join('+');

  const loginStyle = OAuth._loginStyle('github', config, options);

  const loginUrl =
    'https://github.com/login/oauth/authorize' +
    `?client_id=${config.clientId}` +
    `&scope=${flatScope}` +
    `&redirect_uri=${OAuth._redirectUri('github', config)}` +
    `&state=${OAuth._stateParam(loginStyle, credentialToken, options && options.redirectUrl)}`;

  OAuth.launchLogin({
    loginService: "github",
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: {width: 900, height: 450}
  });
};
