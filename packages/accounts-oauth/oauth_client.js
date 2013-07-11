// Send an OAuth login method to the server. If the user authorized
// access in the popup this should log the user in, otherwise
// nothing should happen.
Accounts.oauth.tryLoginAfterPopupClosed = function(credentialToken, callback) {
  Accounts.callLoginMethod({
    methodArguments: [{oauth: {credentialToken: credentialToken}}],
    userCallback: callback && function (err) {
      // Allow server to specify a specify subclass of errors. We should come
      // up with a more generic way to do this!
      if (err && err instanceof Meteor.Error &&
          err.error === Accounts.LoginCancelledError.numericError) {
        callback(new Accounts.LoginCancelledError(err.details));
      } else {
        callback(err);
      }
    }});
};

Accounts.oauth.credentialRequestCompleteHandler = function(callback) {
  return function (credentialTokenOrError) {
    if(credentialTokenOrError && credentialTokenOrError instanceof Error) {
      callback(credentialTokenOrError);
    } else {
      Accounts.oauth.tryLoginAfterPopupClosed(credentialTokenOrError, callback);
    }
  };
}

// Mimic Existing Oauth login method for link external service's account 
// to Meteor user account.  
Accounts.oauth.tryLinkAfterPopupClosed = function (credentialToken, callback) {
  Accounts.callLinkMethod({
    methodArguments: [{oauth: {credentialToken: credentialToken}}],
    userCallback: callback && function (err) {
      // Allow server to specify a specify subclass of errors. We should come
      // up with a more generic way to do this!
      if (err && err instanceof Meteor.Error &&
          err.error === Accounts.LinkCancelledError.numericError) {
        callback(new Accounts.LinkCancelledError(err.details));
      } else {
        callback(err);
      }
    }});
};

Accounts.oauth.linkRequestCompleteHandler = function (callback) {
  return function (credentialTokenOrError) {
    if(credentialTokenOrError && credentialTokenOrError instanceof Error) {
      callback(credentialTokenOrError);
    } else {
      Accounts.oauth.tryLinkAfterPopupClosed(credentialTokenOrError, callback);
    }
  };
}