Meteor.loginWithTwitter = function(options, callback) {
  Twitter.requestCredential(options, callback, Accounts.oauth.tryLoginAfterPopupClosed);
};