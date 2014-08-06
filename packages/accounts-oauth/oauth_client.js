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
