// credentialToken -> credentialSecret. You must provide both the
// credentialToken and the credentialSecret to retrieve an access token from
// the _pendingCredentials collection.
var credentialSecrets = {};

OAuth = {};

OAuth.showPopup = function (url, callback, dimensions) {
  throw new Error("OAuth.showPopup must be implemented on this arch.");
};

// Determine the login style (popup or redirect) for this login flow.
//
//
OAuth._loginStyle = function (service, config, options) {

  if (Meteor.isCordova) {
    return "popup";
  }

  var loginStyle = (options && options.loginStyle) || config.loginStyle || 'popup';

  if (! _.contains(["popup", "redirect"], loginStyle))
    throw new Error("Invalid login style: " + loginStyle);

  // If we don't have session storage (for example, Safari in private
  // mode), the redirect login flow won't work, so fallback to the
  // popup style.
  if (loginStyle === 'redirect') {
    try {
      sessionStorage.setItem('Meteor.oauth.test', 'test');
      sessionStorage.removeItem('Meteor.oauth.test');
    } catch (e) {
      loginStyle = 'popup';
    }
  }

  return loginStyle;
};

OAuth._stateParam = function (loginStyle, credentialToken, redirectUrl) {
  var state = {
    loginStyle: loginStyle,
    credentialToken: credentialToken,
    isCordova: Meteor.isCordova
  };

  if (loginStyle === 'redirect')
    state.redirectUrl = redirectUrl || ('' + window.location);

  // Encode base64 as not all login services URI-encode the state
  // parameter when they pass it back to us.
  // Use the 'base64' package here because 'btoa' isn't supported in IE8/9.
  return Base64.encode(JSON.stringify(state));
};


// At the beginning of the redirect login flow, before we redirect to
// the login service, save the credential token for this login attempt
// in the reload migration data.
//
OAuth.saveDataForRedirect = function (loginService, credentialToken) {
  Reload._onMigrate('oauth', function () {
    return [true, {loginService: loginService, credentialToken: credentialToken}];
  });
  Reload._migrate(null, {immediateMigration: true});
};

// At the end of the redirect login flow, when we've redirected back
// to the application, retrieve the credentialToken and (if the login
// was successful) the credentialSecret.
//
// Called at application startup.  Returns null if this is normal
// application startup and we weren't just redirected at the end of
// the login flow.
//
OAuth.getDataAfterRedirect = function () {
  var migrationData = Reload._migrationData('oauth');

  if (! (migrationData && migrationData.credentialToken))
    return null;

  var credentialToken = migrationData.credentialToken;
  var key = OAuth._storageTokenPrefix + credentialToken;
  var credentialSecret;
  try {
    credentialSecret = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
  } catch (e) {
    Meteor._debug('error retrieving credentialSecret', e);
  }
  return {
    loginService: migrationData.loginService,
    credentialToken: credentialToken,
    credentialSecret: credentialSecret
  };
};

// Launch an OAuth login flow.  For the popup login style, show the
// popup.  For the redirect login style, save the credential token for
// this login attempt in the reload migration data, and redirect to
// the service for the login.
//
// options:
//  loginService: "facebook", "google", etc.
//  loginStyle: "popup" or "redirect"
//  loginUrl: The URL at the login service provider to start the OAuth flow.
//  credentialRequestCompleteCallback: for the popup flow, call when the popup
//    is closed and we have the credential from the login service.
//  credentialToken: our identifier for this login flow.
//
OAuth.launchLogin = function (options) {
  if (! options.loginService)
    throw new Error('loginService required');
  if (options.loginStyle === 'popup') {
    OAuth.showPopup(
      options.loginUrl,
      _.bind(options.credentialRequestCompleteCallback, null, options.credentialToken),
      options.popupOptions);
  } else if (options.loginStyle === 'redirect') {
    OAuth.saveDataForRedirect(options.loginService, options.credentialToken);
    window.location = options.loginUrl;
  } else {
    throw new Error('invalid login style');
  }
};

// XXX COMPAT WITH 0.7.0.1
// Private interface but probably used by many oauth clients in atmosphere.
OAuth.initiateLogin = function (credentialToken, url, callback, dimensions) {
  OAuth.showPopup(
    url,
    _.bind(callback, null, credentialToken),
    dimensions
  );
};

// Called by the popup when the OAuth flow is completed, right before
// the popup closes.
OAuth._handleCredentialSecret = function (credentialToken, secret) {
  check(credentialToken, String);
  check(secret, String);
  if (! _.has(credentialSecrets,credentialToken)) {
    credentialSecrets[credentialToken] = secret;
  } else {
    throw new Error("Duplicate credential token from OAuth login");
  }
};

// Used by accounts-oauth, which needs both a credentialToken and the
// corresponding to credential secret to call the `login` method over DDP.
OAuth._retrieveCredentialSecret = function (credentialToken) {
  // First check the secrets collected by OAuth._handleCredentialSecret,
  // then check localStorage. This matches what we do in
  // end_of_login_response.html.
  var secret = credentialSecrets[credentialToken];
  if (! secret) {
    var localStorageKey = OAuth._storageTokenPrefix + credentialToken;
    secret = Meteor._localStorage.getItem(localStorageKey);
    Meteor._localStorage.removeItem(localStorageKey);
  } else {
    delete credentialSecrets[credentialToken];
  }
  return secret;
};
