Accounts.oauth.registerService('twitch');

if (Meteor.isClient) {
  const loginWithTwitch = (options, callback) => {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = null;
    }

    const credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    Twitch.requestCredential(options, credentialRequestCompleteCallback);
  };
  Accounts.registerClientLoginFunction('twitch', loginWithTwitch);
  Meteor.loginWithTwitch =
    (...args) => Accounts.applyLoginFunction('twitch', args);
} else {
  Accounts.addAutopublishFields({
    forLoggedInUser: ['services.twitch'],
    forOtherUsers: ['services.twitch.id'],
  });
}
