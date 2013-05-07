Accounts.loginWithWeibo = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Weibo.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.loginWithWeibo = Accounts.loginWithWeibo;