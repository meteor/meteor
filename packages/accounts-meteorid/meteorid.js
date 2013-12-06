Accounts.oauth.registerService("meteorid");

if (Meteor.isClient) {
  Meteor.loginWithMeteorId = function (callback) {
    var credentialRequestCompleteCallback =
          Accounts.oauth.credentialRequestCompleteHandler(callback);
    MeteorId.requestCredential(credentialRequestCompleteCallback);
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
