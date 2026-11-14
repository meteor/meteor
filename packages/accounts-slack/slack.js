Accounts.oauth.registerService('slack');

if (Meteor.isClient) {
  const loginWithSlack = (options, callback) => {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = null;
    }

    const credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    Slack.requestCredential(options, credentialRequestCompleteCallback);
  };
  Accounts.registerClientLoginFunction('slack', loginWithSlack);
  Meteor.loginWithSlack =
    (...args) => Accounts.applyLoginFunction('slack', args);
} else {
  Accounts.addAutopublishFields({
    forLoggedInUser: ['services.slack'],
    forOtherUsers: ['services.slack.id', 'services.slack.name'],
  });
}
