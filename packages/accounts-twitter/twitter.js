Accounts.oauth.registerService('twitter');

if (Meteor.isClient) {
  const loginWithTwitter = (options, callback) => {
    // support a callback without options
    if (! callback && typeof options === "function") {
      callback = options;
      options = null;
    }

    const credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    Twitter.requestCredential(options, credentialRequestCompleteCallback);
  };
  Accounts.registerClientLoginFunction('twitter', loginWithTwitter);
  Meteor.loginWithTwitter = (...args) =>
    Accounts.applyLoginFunction('twitter', args);
} else {
  const autopublishedFields = 
    // don't send access token. https://dev.twitter.com/discussions/5025
    Twitter.whitelistedFields.concat(['id', 'screenName']).map(
      subfield => `services.twitter.${subfield}`
    );

  Accounts.addAutopublishFields({
    forLoggedInUser: autopublishedFields,
    forOtherUsers: autopublishedFields
  });
}
