Google = {};

// Request Google credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Google.requestCredential = function (options, credentialRequestCompleteCallback) {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  } else if (!options) {
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'google'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }

  var credentialToken = Random.secret();

  // always need this to get user id from google.
  var requiredScope = ['profile'];
  var scope = ['email'];
  if (options.requestPermissions)
    scope = options.requestPermissions;
  scope = _.union(scope, requiredScope);
  var flatScope = _.map(scope, encodeURIComponent).join('+');

  // https://developers.google.com/accounts/docs/OAuth2WebServer#formingtheurl
  var accessType = options.requestOfflineToken ? 'offline' : 'online';

  var loginStyle = OAuth._loginStyle('google', config, options);

  var loginUrl =
        'https://accounts.google.com/o/oauth2/auth' +
        '?response_type=code' +
        '&client_id=' + config.clientId +
        '&scope=' + flatScope +
        '&redirect_uri=' + OAuth._redirectUri('google', config) +
        '&state=' + OAuth._stateParam(loginStyle, credentialToken) +
        '&access_type=' + accessType;

  if (typeof options.prompt === 'string') {
    loginUrl += '&prompt=' + options.prompt;
  } else if (options.forceApprovalPrompt) {
    loginUrl += '&prompt=consent';
  }

  // limits sign-in to a particular google apps hosted domain
  if (options.hostedDomain) {
    loginUrl += '&hd=' + encodeURIComponent(options.hostedDomain);
  }

  OAuth.launchLogin({
    loginService: "google",
    loginStyle: loginStyle,
    loginUrl: loginUrl,
    credentialRequestCompleteCallback: credentialRequestCompleteCallback,
    credentialToken: credentialToken,
    popupOptions: { height: 600 }
  });
};
