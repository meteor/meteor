Meteor.loginWithFacebook = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Facebook.requestCredential(options, credentialRequestCompleteCallback);
};