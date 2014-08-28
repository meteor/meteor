// Allow server to specify a specify subclass of errors. We should come
// up with a more generic way to do this!
var convertError = function (err) {
  if (err && err instanceof Meteor.Error &&
      err.error === Accounts.LoginCancelledError.numericError)
    return new Accounts.LoginCancelledError(err.reason);
  else
    return err;
};

// Called when the redirect login flow is complete, either
// successfully or with an error.
//
// TODO this needs to report back to code which initiated the login.
// (For example, accounts-ui closes the login dialog on success and
// displays the error on failure).

var redirectComplete = function (err) {
  if (err)
    Meteor._debug("login failure", err);
  else
    Meteor._debug("login success");
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

  Accounts.callLoginMethod({
    methodArguments: [{oauth: oauth}],
    userCallback: function (err) {
      redirectComplete(convertError(err));
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
