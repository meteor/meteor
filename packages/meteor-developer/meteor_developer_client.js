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

  var loginStyle = OAuth._loginStyle('facebook', config);

  var loginUrl =
        MeteorDeveloperAccounts._server +
        "/oauth2/authorize?" +
        "state=" + OAuth._stateParam(loginStyle, credentialToken) +
        "&response_type=code&" +
        "client_id=" + config.clientId;

  if (options && options.userEmail)
    loginUrl += '&user_email=' + encodeURIComponent(options.userEmail);

  loginUrl += "&redirect_uri=" + Meteor.absoluteUrl("_oauth/meteor-developer?close");

  OAuth.launchLogin(
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    {width: 470, height: 420});
};

MeteorDeveloperAccounts.requestCredential = requestCredential;
