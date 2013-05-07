Meteor.loginWithWeibo = function(options, callback) {
  Weibo.requestCredential(options, callback, Accounts.oauth.tryLoginAfterPopupClosed);
};