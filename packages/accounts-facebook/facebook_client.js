Meteor.loginWithFacebook = function(options, callback) {
  Facebook.requestCredential(options, callback, Accounts.oauth.tryLoginAfterPopupClosed);
};