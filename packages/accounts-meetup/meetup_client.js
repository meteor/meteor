Meteor.loginWithMeetup = function(options, callback) {
  Meetup.requestCredential(options, callback, Accounts.oauth.tryLoginAfterPopupClosed);
};