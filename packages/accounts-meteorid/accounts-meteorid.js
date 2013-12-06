Accounts.oauth.registerService("meteorid");

if (Meteor.isClient) {
  // Options are documented in the meteor-auth package.
  Meteor.loginWithMeteorId = function (options, callback) {
    // support a callback without options
    if (! callback && typeof options === "function") {
      callback = options;
      options = null;
    }

    var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    MeteorId.requestCredential(options, credentialRequestCompleteCallback);
  };
}
