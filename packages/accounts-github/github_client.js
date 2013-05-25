Meteor.loginWithGithub = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Github.requestCredential(options, credentialRequestCompleteCallback);
};