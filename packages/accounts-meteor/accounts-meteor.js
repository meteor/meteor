Accounts.oauth.registerService("meteor");

if (Meteor.isClient) {
  // Options are documented in the meteor-auth package.
  Meteor.loginWithMeteor = function (options, callback) {
    // support a callback without options
    if (! callback && typeof options === "function") {
      callback = options;
      options = null;
    }

    var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    MeteorAccounts.requestCredential(options, credentialRequestCompleteCallback);
  };
}
