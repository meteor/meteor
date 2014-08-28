// credentialToken -> credentialSecret. You must provide both the
// credentialToken and the credentialSecret to retrieve an access token from
// the _pendingCredentials collection.
var credentialSecrets = {};

OAuth = {};

// Determine the login style (popup or redirect) for this login flow.
//
// This could be overridden to for example choose the redirect login
// style in a UIWebView and the popup style otherwise.
//
OAuth._loginStyle = function (service, config) {
  var loginStyle = config.loginStyle || 'popup';

  if (loginStyle === 'redirect') {
    // Safari in private mode doesn't support session storage, so
    // force the popup style when session storage is unavailable.
    try {
      sessionStorage.setItem('Meteor.oauth.test', 'test');
      sessionStorage.removeItem('Meteor.oauth.test');
    } catch (e) {
      loginStyle = 'popup';
    }
  }

  return loginStyle;
};

OAuth._stateParam = function (loginStyle, credentialToken) {
  state = {
    loginStyle: loginStyle,
    credentialToken: credentialToken
  };

  if (loginStyle === 'redirect')
    state.redirectUrl = '' + window.location;

  // Encode base64 as not all login services URI-encode the state
  // parameter when they pass it back to us.

  return btoa(JSON.stringify(state));
};


// At the beginning of the redirect login flow, before we redirect to
// the login service, save the credential token for this login attempt
// in the reload migration data.
//
OAuth.saveDataForRedirect = function (credentialToken) {
  Reload._onMigrate('oauth', function () {
    return [true, {credentialToken: credentialToken}];
  });
  Reload._migrate(null, {immediateMigration: true});
};

// At the end of the redirect login flow, when we've redirected back
// to the application, retrieve the credentialToken and (if the login
// was successful) the credentialSecret.
//
// Called at application startup.  Returns null if this is normal
// application startup and we weren't just redirected at the end of
// the login flow).
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
    credentialToken: credentialToken,
    credentialSecret: credentialSecret
  };
}

// Launch an OAuth login flow.  For the popup login style, show the
// popup.  For the redirect login style, save the credential token for
// this login attempt in the reload migration data, and redirect to
// the service for the login.
//
OAuth.launchLogin = function (
  loginStyle, loginUrl, credentialRequestCompleteCallback, credentialToken,
  popupOptions)
{
  if (loginStyle === 'popup') {
    OAuth.showPopup(
      loginUrl,
      _.bind(credentialRequestCompleteCallback, null, credentialToken),
      popupOptions);
  } else if (loginStyle === 'redirect') {
    OAuth.saveDataForRedirect(credentialToken);
    window.location = loginUrl;
  } else {
    throw new Error('invalid login style');
  }
};


// Open a popup window, centered on the screen, and call a callback when it
// closes.
//
// @param url {String} url to show
// @param callback {Function} Callback function to call on completion. Takes no
//   arguments.
// @param dimensions {optional Object(width, height)} The dimensions of
//   the popup. If not passed defaults to something sane.
OAuth.showPopup = function (url, callback, dimensions) {
  // default dimensions that worked well for facebook and google
  var popup = openCenteredPopup(
    url,
    (dimensions && dimensions.width) || 650,
    (dimensions && dimensions.height) || 331
  );

  var checkPopupOpen = setInterval(function() {
    try {
      // Fix for #328 - added a second test criteria (popup.closed === undefined)
      // to humour this Android quirk:
      // http://code.google.com/p/android/issues/detail?id=21061
      var popupClosed = popup.closed || popup.closed === undefined;
    } catch (e) {
      // For some unknown reason, IE9 (and others?) sometimes (when
      // the popup closes too quickly?) throws "SCRIPT16386: No such
      // interface supported" when trying to read 'popup.closed'. Try
      // again in 100ms.
      return;
    }

    if (popupClosed) {
      clearInterval(checkPopupOpen);
      callback();
    }
  }, 100);
};


var openCenteredPopup = function(url, width, height) {
  var screenX = typeof window.screenX !== 'undefined'
        ? window.screenX : window.screenLeft;
  var screenY = typeof window.screenY !== 'undefined'
        ? window.screenY : window.screenTop;
  var outerWidth = typeof window.outerWidth !== 'undefined'
        ? window.outerWidth : document.body.clientWidth;
  var outerHeight = typeof window.outerHeight !== 'undefined'
        ? window.outerHeight : (document.body.clientHeight - 22);
  // XXX what is the 22?

  // Use `outerWidth - width` and `outerHeight - height` for help in
  // positioning the popup centered relative to the current window
  var left = screenX + (outerWidth - width) / 2;
  var top = screenY + (outerHeight - height) / 2;
  var features = ('width=' + width + ',height=' + height +
                  ',left=' + left + ',top=' + top + ',scrollbars=yes');

  var newwindow = window.open(url, 'Login', features);
  if (newwindow.focus)
    newwindow.focus();
  return newwindow;
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
