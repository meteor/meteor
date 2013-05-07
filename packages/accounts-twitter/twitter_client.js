Meteor.loginWithTwitter = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Twitter.requestCredential(options, credentialRequestCompleteCallback);
};