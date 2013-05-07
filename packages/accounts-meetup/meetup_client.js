Accounts.loginWithMeetup = function(options, callback) {
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Meetup.requestCredential(options, credentialRequestCompleteCallback);
};

Meteor.loginWithMeetup = Accounts.loginWithMeetup;