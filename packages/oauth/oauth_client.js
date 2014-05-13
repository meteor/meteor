// credentialToken -> credentialSecret. You must provide both the
// credentialToken and the credentialSecret to retrieve an access token from
// the _pendingCredentials collection.
var credentialSecrets = {};

OAuth = {};

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
  var secret = credentialSecrets[credentialToken];
  delete credentialSecrets[credentialToken];
  return secret;
};
