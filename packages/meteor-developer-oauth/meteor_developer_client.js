// Request Meteor developer account credentials for the user
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
const requestCredential = (options, credentialRequestCompleteCallback) => {
  // support a callback without options
  if (! credentialRequestCompleteCallback && typeof options === "function") {
    credentialRequestCompleteCallback = options;
    options = null;
  }

  const config = ServiceConfiguration.configurations.findOne({
    service: 'meteor-developer'
  });
  if (!config) {
    credentialRequestCompleteCallback &&
      credentialRequestCompleteCallback(new ServiceConfiguration.ConfigError());
    return;
  }

  const credentialToken = Random.secret();

  const loginStyle = OAuth._loginStyle('meteor-developer', config, options);

  let loginUrl =
        MeteorDeveloperAccounts._server +
        "/oauth2/authorize?" +
        `state=${OAuth._stateParam(loginStyle, credentialToken, options?.redirectUrl)}` +
        "&response_type=code" +
        `&client_id=${config.clientId}${options?.details ? `&details=${options?.details}` : ''}`;

  /**
   * @deprecated in 1.3.0
   */
  if (options?.userEmail && !options?.loginHint) {
    options.loginHint = options.userEmail;
    delete options.userEmail;
  }

  if (options?.loginHint) {
    loginUrl += `&user_email=${encodeURIComponent(options.loginHint)}`;
  }

  loginUrl += `&redirect_uri=${options?.redirectUrl || OAuth._redirectUri('meteor-developer', config)}`;

  OAuth.launchLogin({
    loginService: "meteor-developer",
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: {width: 497, height: 749}
  });
};

MeteorDeveloperAccounts.requestCredential = requestCredential;
