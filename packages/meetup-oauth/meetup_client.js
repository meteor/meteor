Meetup = {};
// Request Meetup credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Meetup.requestCredential = (options, credentialRequestCompleteCallback) => {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  const config = ServiceConfiguration.configurations.findOne({service: 'meetup'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }

  // For some reason, meetup converts underscores to spaces in the state
  // parameter when redirecting back to the client, so we use
  // `Random.id()` here (alphanumerics) instead of `Random.secret()`
  // (base 64 characters).
  const credentialToken = Random.id();

  const scope = (options && options.requestPermissions) || [];
  const flatScope = scope.map(encodeURIComponent).join('+');

  const loginStyle = OAuth._loginStyle('meetup', config, options);

  const loginUrl =
        'https://secure.meetup.com/oauth2/authorize' +
        `?client_id=${config.clientId}` +
        '&response_type=code' +
        `&scope=${flatScope}` +
        `&redirect_uri=${OAuth._redirectUri('meetup', config)}` +
        `&state=${OAuth._stateParam(loginStyle, credentialToken, options && options.redirectUrl)}`;

  // meetup box gets taller when permissions requested.
  let height = 620;
  if (Object.prototype.hasOwnProperty.call(scope, 'basic') ? scope.length - 1 : scope.length)
    height += 130;

  OAuth.launchLogin({
    loginService: "meetup",
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: { width: 900, height },
  });
};
