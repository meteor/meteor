Accounts.oauth.registerService("meteorid");

if (Meteor.isClient) {
  Meteor.loginWithMeteorId = function (options, callback) {
    // support a callback without options
    if (! callback && typeof options === "function") {
      callback = options;
      options = null;
    }

    var credentialRequestCompleteCallback =
          Accounts.oauth.credentialRequestCompleteHandler(callback);
    MeteorId.requestCredential(options, credentialRequestCompleteCallback);
  };
} else {
  Accounts.addAutopublishFields({
    // publish all fields including access token, which can legitimately be used
    // from the client (if transmitted over ssl or on localhost).
    forLoggedInUser: ['services.meteorid'],
    forOtherUsers: [
      'services.meteorid.username',
      'services.meteorid.profile',
      'services.meteorid.id'
    ]
  });
}
