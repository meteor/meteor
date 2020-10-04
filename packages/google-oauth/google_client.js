import Google from './namespace.js';

const hasOwn = Object.prototype.hasOwnProperty;

const ILLEGAL_PARAMETERS = {
  'response_type': 1,
  'client_id': 1,
  'scope': 1,
  'redirect_uri': 1,
  'state': 1
};

// Request Google credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Google.requestCredential = (options, credentialRequestCompleteCallback) => {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  } else if (!options) {
    options = {};
  }

  const config = ServiceConfiguration.configurations.findOne({service: 'google'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError());
    return;
  }

  const credentialToken = Random.secret();

  // we need the email scope to get user id from google.
  const requiredScopes = { 'email': 1 };
  let scopes = options.requestPermissions || ['profile'];
  scopes.forEach(scope => requiredScopes[scope] = 1);
  scopes = Object.keys(requiredScopes);

  const loginUrlParameters = {};
  if (config.loginUrlParameters){
    Object.assign(loginUrlParameters, config.loginUrlParameters);
  }
  if (options.loginUrlParameters){
    Object.assign(loginUrlParameters, options.loginUrlParameters);
  }

  // validate options keys
  Object.keys(loginUrlParameters).forEach(key => {
    if (hasOwn.call(ILLEGAL_PARAMETERS, key)) {
      throw new Error(`Google.requestCredential: Invalid loginUrlParameter: ${key}`);
    }
  });

  // backwards compatible options
  if (options.requestOfflineToken != null){
    loginUrlParameters.access_type = options.requestOfflineToken ? 'offline' : 'online'
  }
  if (options.prompt != null) {
    loginUrlParameters.prompt = options.prompt;
  } else if (options.forceApprovalPrompt) {
    loginUrlParameters.prompt = 'consent'
  }

  if (options.loginHint) {
    loginUrlParameters.login_hint = options.loginHint;
  }

  const loginStyle = OAuth._loginStyle('google', config, options);
  // https://developers.google.com/accounts/docs/OAuth2WebServer#formingtheurl
  Object.assign(loginUrlParameters, {
    "response_type": "code",
    "client_id":  config.clientId,
    "scope": scopes.join(' '), // space delimited
    "redirect_uri": OAuth._redirectUri('google', config),
    "state": OAuth._stateParam(loginStyle, credentialToken, options.redirectUrl)
  });
  const loginUrl = 'https://accounts.google.com/o/oauth2/auth?' +
    Object.keys(loginUrlParameters).map(param => 
      `${encodeURIComponent(param)}=${encodeURIComponent(loginUrlParameters[param])}`
    ).join("&");

  OAuth.launchLogin({
    loginService: "google",
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: { height: 600 }
  });
};
