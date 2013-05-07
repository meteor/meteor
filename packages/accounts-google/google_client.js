Accounts.loginWithGoogle = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Google.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.loginWithGoogle = Accounts.loginWithGoogle;