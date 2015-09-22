Meetup = {};
// Request Meetup credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Meetup.requestCredential = function (options, credentialRequestCompleteCallback) {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'meetup'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }

  // For some reason, meetup converts underscores to spaces in the state
  // parameter when redirecting back to the client, so we use
  // `Random.id()` here (alphanumerics) instead of `Random.secret()`
  // (base 64 characters).
  var credentialToken = Random.id();

  var scope = (options && options.requestPermissions) || [];
  var flatScope = _.map(scope, encodeURIComponent).join('+');

  var loginStyle = OAuth._loginStyle('meetup', config, options);

  var loginUrl =
        'https://secure.meetup.com/oauth2/authorize' +
        '?client_id=' + config.clientId +
        '&response_type=code' +
        '&scope=' + flatScope +
        '&redirect_uri=' + OAuth._redirectUri('meetup', config) +
        '&state=' + OAuth._stateParam(loginStyle, credentialToken, options && options.redirectUrl);

  // meetup box gets taller when permissions requested.
  var height = 620;
  if (_.without(scope, 'basic').length)
    height += 130;

  OAuth.launchLogin({
    loginService: "meetup",
    loginStyle: loginStyle,
    loginUrl: loginUrl,
    credentialRequestCompleteCallback: credentialRequestCompleteCallback,
    credentialToken: credentialToken,
    popupOptions: {width: 900, height: height}
  });
};
