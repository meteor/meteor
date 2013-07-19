Meteor.loginWithTrello = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Trello.requestCredential(options, credentialRequestCompleteCallback);
};