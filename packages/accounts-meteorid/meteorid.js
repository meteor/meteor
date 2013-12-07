Accounts.oauth.registerService("meteorId");

if (Meteor.isClient) {
  Meteor.loginWithMeteorId = function (options, callback) {
    var credentialRequestCompleteCallback =
          Accounts.oauth.credentialRequestCompleteHandler(callback);
    MeteorId.requestCredential(credentialRequestCompleteCallback);
  };
} else {
  Accounts.addAutopublishFields({
    // publish all fields including access token, which can legitimately be used
    // from the client (if transmitted over ssl or on localhost).
    forLoggedInUser: ['services.meteorId'],
    forOtherUsers: [
      'services.meteorId.username',
      'services.meteorId.profile',
      'services.meteorId.id'
    ]
  });
}
