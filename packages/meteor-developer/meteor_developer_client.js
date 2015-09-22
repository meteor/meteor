// Request Meteor developer account credentials for the user
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
var requestCredential = function (options, credentialRequestCompleteCallback) {
  // support a callback without options
  if (! credentialRequestCompleteCallback && typeof options === "function") {
    credentialRequestCompleteCallback = options;
    options = null;
  }

  var config = ServiceConfiguration.configurations.findOne({
    service: 'meteor-developer'
  });
  if (!config) {
    credentialRequestCompleteCallback &&
      credentialRequestCompleteCallback(new ServiceConfiguration.ConfigError());
    return;
  }

  var credentialToken = Random.secret();

  var loginStyle = OAuth._loginStyle('meteor-developer', config, options);

  var loginUrl =
        MeteorDeveloperAccounts._server +
        "/oauth2/authorize?" +
        "state=" + OAuth._stateParam(loginStyle, credentialToken, options && options.redirectUrl) +
        "&response_type=code&" +
        "client_id=" + config.clientId;

  if (options && options.userEmail)
    loginUrl += '&user_email=' + encodeURIComponent(options.userEmail);

  loginUrl += "&redirect_uri=" + OAuth._redirectUri('meteor-developer', config);

  OAuth.launchLogin({
    loginService: "meteor-developer",
    loginStyle: loginStyle,
    loginUrl: loginUrl,
    credentialRequestCompleteCallback: credentialRequestCompleteCallback,
    credentialToken: credentialToken,
    popupOptions: {width: 470, height: 490}
  });
};

MeteorDeveloperAccounts.requestCredential = requestCredential;
