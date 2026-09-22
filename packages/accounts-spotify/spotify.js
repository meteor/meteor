Accounts.oauth.registerService('spotify');

if (Meteor.isClient) {
  const loginWithSpotify = (options, callback) => {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = null;
    }

    const credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    Spotify.requestCredential(options, credentialRequestCompleteCallback);
  };
  Accounts.registerClientLoginFunction('spotify', loginWithSpotify);
  Meteor.loginWithSpotify =
    (...args) => Accounts.applyLoginFunction('spotify', args);
} else {
  Accounts.addAutopublishFields({
    forLoggedInUser: ['services.spotify'],
    forOtherUsers: ['services.spotify.id'],
  });
}
