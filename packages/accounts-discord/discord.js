Accounts.oauth.registerService('discord');

if (Meteor.isClient) {
  const loginWithDiscord = (options, callback) => {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = null;
    }

    const credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    Discord.requestCredential(options, credentialRequestCompleteCallback);
  };
  Accounts.registerClientLoginFunction('discord', loginWithDiscord);
  Meteor.loginWithDiscord =
    (...args) => Accounts.applyLoginFunction('discord', args);
} else {
  Accounts.addAutopublishFields({
    forLoggedInUser: ['services.discord'],
    forOtherUsers: ['services.discord.id', 'services.discord.username'],
  });
}
