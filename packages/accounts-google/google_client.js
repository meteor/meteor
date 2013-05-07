Meteor.loginWithGoogle = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Google.requestCredential(options, credentialRequestCompleteCallback);
};