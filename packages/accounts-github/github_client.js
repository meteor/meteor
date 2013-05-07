Meteor.loginWithGithub = function(options, callback) {
  Github.requestCredential(options, callback, Accounts.oauth.tryLoginAfterPopupClosed);
};