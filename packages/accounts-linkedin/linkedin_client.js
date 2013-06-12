Meteor.loginWithLinkedin = function (options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  LinkedIn.requestCredential(options, credentialRequestCompleteCallback);
};
