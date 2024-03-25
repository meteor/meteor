// credentialToken -> credentialSecret. You must provide both the
// credentialToken and the credentialSecret to retrieve an access token from
// the _pendingCredentials collection.
const credentialSecrets = {};

OAuth = {};

OAuth.showPopup = (url, callback, dimensions) => {
  throw new Error("OAuth.showPopup must be implemented on this arch.");
};

// Determine the login style (popup or redirect) for this login flow.
//
//
OAuth._loginStyle = (service, config, options) => {

  if (Meteor.isCordova) {
    return "popup";
  }

  let loginStyle = (options && options.loginStyle) || config.loginStyle || 'popup';

  if (! ["popup", "redirect"].includes(loginStyle))
    throw new Error(`Invalid login style: ${loginStyle}`);

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

OAuth._stateParam = (loginStyle, credentialToken, redirectUrl) => {
  const state = {
    loginStyle,
    credentialToken,
    isCordova: Meteor.isCordova
  };

  if (loginStyle === 'redirect' ||
    (Meteor.settings?.public?.packages?.oauth?.setRedirectUrlWhenLoginStyleIsPopup && loginStyle === 'popup')
  ) {
    state.redirectUrl = redirectUrl || ('' + window.location);
  }

  // Encode base64 as not all login services URI-encode the state
  // parameter when they pass it back to us.
  // Use the 'base64' package here because 'btoa' isn't supported in IE8/9.
  return Base64.encode(JSON.stringify(state));
};


// At the beginning of the redirect login flow, before we redirect to
// the login service, save the credential token for this login attempt
// in the reload migration data.
//
OAuth.saveDataForRedirect = (loginService, credentialToken) => {
  Reload._onMigrate('oauth', () => [true, { loginService, credentialToken }]);
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
OAuth.getDataAfterRedirect = () => {
  const migrationData = Reload._migrationData('oauth');

  if (! (migrationData && migrationData.credentialToken))
    return null;

  const { credentialToken } = migrationData;
  const key = OAuth._storageTokenPrefix + credentialToken;
  let credentialSecret;
  try {
    credentialSecret = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
  } catch (e) {
    Meteor._debug('error retrieving credentialSecret', e);
  }
  return {
    loginService: migrationData.loginService,
    credentialToken,
    credentialSecret,
  };
};

/**
 * Launch an OAuth login flow.  For the popup login style, show the
 * popup.  For the redirect login style, save the credential token for
 * this login attempt in the reload migration data, and redirect to
 * the service for the login.
 *
 * @param {Object} options
 * @param {string} options.loginService "facebook", "google", etc.
 * @param {string} options.loginStyle "popup" or "redirect"
 * @param {string} options.loginUrl The URL at the login service provider to start the OAuth flow.
 *  credentialRequestCompleteCallback: for the popup flow, call when the popup
 *    is closed and we have the credential from the login service.
 * @param {string} options.credentialToken our identifier for this login flow.
 **/
OAuth.launchLogin = options => {
  if (! options.loginService)
    throw new Error('loginService required');
  if (options.loginStyle === 'popup') {
    OAuth.showPopup(
      options.loginUrl,
      options.credentialRequestCompleteCallback.bind(null, options.credentialToken),
      options.popupOptions);
  } else if (options.loginStyle === 'redirect') {
    OAuth.saveDataForRedirect(options.loginService, options.credentialToken);
    window.location = options.loginUrl;
  } else {
    throw new Error('invalid login style');
  }
};

// Called by the popup when the OAuth flow is completed, right before
// the popup closes.
OAuth._handleCredentialSecret = (credentialToken, secret) => {
  check(credentialToken, String);
  check(secret, String);
  if (! Object.prototype.hasOwnProperty.call(credentialSecrets, credentialToken)) {
    credentialSecrets[credentialToken] = secret;
  } else {
    throw new Error("Duplicate credential token from OAuth login");
  }
};

// Used by accounts-oauth, which needs both a credentialToken and the
// corresponding to credential secret to call the `login` method over DDP.
OAuth._retrieveCredentialSecret = credentialToken => {
  // First check the secrets collected by OAuth._handleCredentialSecret,
  // then check localStorage. This matches what we do in
  // end_of_login_response.html.
  let secret = credentialSecrets[credentialToken];
  if (! secret) {
    const localStorageKey = OAuth._storageTokenPrefix + credentialToken;
    secret = Meteor._localStorage.getItem(localStorageKey);
    Meteor._localStorage.removeItem(localStorageKey);
  } else {
    delete credentialSecrets[credentialToken];
  }
  return secret;
};
