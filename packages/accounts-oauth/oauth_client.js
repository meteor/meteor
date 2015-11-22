// Documentation for Meteor.loginWithExternalService

/**
 * @name loginWith<ExternalService>
 * @memberOf Meteor
 * @function
 * @summary Log the user in using an external service.
 * @locus Client
 * @param {Object} [options]
 * @param {String[]} options.requestPermissions A list of permissions to request from the user.
 * @param {Boolean} options.requestOfflineToken If true, asks the user for permission to act on their behalf when offline. This stores an additional offline token in the `services` field of the user document. Currently only supported with Google.
 * @param {Object} options.loginUrlParameters Provide additional parameters to the authentication uri. Currently only supported with Google {@url https://developers.google.com/identity/protocols/OpenIDConnect#authenticationuriparameters}.
 * @param {String} options.loginHint An email address that the external service will use to pre-fill the login prompt. Currently only supported with Meteor developer accounts and Google accounts. If used with Google, the Google User ID can also be passed.
 * @param {String} options.loginStyle Login style ("popup" or "redirect", defaults to the login service configuration).  The "popup" style opens the login page in a separate popup window, which is generally preferred because the Meteor application doesn't need to be reloaded.  The "redirect" style redirects the Meteor application's window to the login page, and the login service provider redirects back to the Meteor application which is then reloaded.  The "redirect" style can be used in situations where a popup window can't be opened, such as in a mobile UIWebView.  The "redirect" style however relies on session storage which isn't available in Safari private mode, so the "popup" style will be forced if session storage can't be used.
 * @param {String} options.redirectUrl If using "redirect" login style, the user will be returned to this URL after authorisation has been completed.
 * @param {Function} [callback] Optional callback. Called with no arguments on success, or with a single `Error` argument on failure. The callback cannot be called if you are using the "redirect" `loginStyle`, because the app will have reloaded in the meantime; try using [client-side login hooks](#accounts_onlogin) instead.
 */

// Allow server to specify a specify subclass of errors. We should come
// up with a more generic way to do this!
var convertError = function (err) {
  if (err && err instanceof Meteor.Error &&
      err.error === Accounts.LoginCancelledError.numericError)
    return new Accounts.LoginCancelledError(err.reason);
  else
    return err;
};


// For the redirect login flow, the final step is that we're
// redirected back to the application.  The credentialToken for this
// login attempt is stored in the reload migration data, and the
// credentialSecret for a successful login is stored in session
// storage.

Meteor.startup(function () {
  var oauth = OAuth.getDataAfterRedirect();
  if (! oauth)
    return;

  // We'll only have the credentialSecret if the login completed
  // successfully.  However we still call the login method anyway to
  // retrieve the error if the login was unsuccessful.

  var methodName = 'login';
  var methodArguments = [{oauth: _.pick(oauth, 'credentialToken', 'credentialSecret')}];

  Accounts.callLoginMethod({
    methodArguments: methodArguments,
    userCallback: function (err) {
      // The redirect login flow is complete.  Construct an
      // `attemptInfo` object with the login result, and report back
      // to the code which initiated the login attempt
      // (e.g. accounts-ui, when that package is being used).
      err = convertError(err);
      Accounts._pageLoadLogin({
        type: oauth.loginService,
        allowed: !err,
        error: err,
        methodName: methodName,
        methodArguments: methodArguments
      });
    }
  });
});


// Send an OAuth login method to the server. If the user authorized
// access in the popup this should log the user in, otherwise
// nothing should happen.
Accounts.oauth.tryLoginAfterPopupClosed = function(credentialToken, callback) {
  var credentialSecret = OAuth._retrieveCredentialSecret(credentialToken) || null;
  Accounts.callLoginMethod({
    methodArguments: [{oauth: {
      credentialToken: credentialToken,
      credentialSecret: credentialSecret
    }}],
    userCallback: callback && function (err) {
      callback(convertError(err));
    }});
};

Accounts.oauth.credentialRequestCompleteHandler = function(callback) {
  return function (credentialTokenOrError) {
    if(credentialTokenOrError && credentialTokenOrError instanceof Error) {
      callback && callback(credentialTokenOrError);
    } else {
      Accounts.oauth.tryLoginAfterPopupClosed(credentialTokenOrError, callback);
    }
  };
};
