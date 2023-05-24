Accounts.oauth.registerService('github');

if (Meteor.isClient) {
  const loginWithGithub = (options, callback) => {
    // support a callback without options
    if (! callback && typeof options === "function") {
      callback = options;
      options = null;
    }

    const credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    Github.requestCredential(options, credentialRequestCompleteCallback);
  };
  Accounts.registerClientLoginFunction('github', loginWithGithub);
  Meteor.loginWithGithub = 
    (...args) => Accounts.applyLoginFunction('github', args);
} else {
  Accounts.addAutopublishFields({
    // not sure whether the github api can be used from the browser,
    // thus not sure if we should be sending access tokens; but we do it
    // for all other oauth2 providers, and it may come in handy.
    forLoggedInUser: ['services.github'],
    forOtherUsers: ['services.github.username']
  });
}
