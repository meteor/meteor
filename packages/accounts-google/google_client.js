Meteor.loginWithGoogle = function(options, callback) {
  Google.requestCredential(options, callback, Accounts.oauth.tryLoginAfterPopupClosed);
};