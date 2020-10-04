Accounts.oauth.registerService('meetup');

if (Meteor.isClient) {
  const loginWithMeetup = (options, callback) => {
    // support a callback without options
    if (! callback && typeof options === "function") {
      callback = options;
      options = null;
    }

    const credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    Meetup.requestCredential(options, credentialRequestCompleteCallback);
  };
  Accounts.registerClientLoginFunction('meetup', loginWithMeetup);
  Meteor.loginWithMeetup = 
    (...args) => Accounts.applyLoginFunction('meetup', args);
} else {
  Accounts.addAutopublishFields({
    // publish all fields including access token, which can legitimately
    // be used from the client (if transmitted over ssl or on
    // localhost). http://www.meetup.com/meetup_api/auth/#oauth2implicit
    forLoggedInUser: ['services.meetup'],
    forOtherUsers: ['services.meetup.id']
  });
}
