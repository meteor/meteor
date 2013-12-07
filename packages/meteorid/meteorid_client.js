MeteorId = {};

// Request MeteorId credentials for the user
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
MeteorId.requestCredential = function (credentialRequestCompleteCallback) {
  var config = ServiceConfiguration.configurations.findOne({service: 'meteorId'});
  if (!config) {
    credentialRequestCompleteCallback &&
      credentialRequestCompleteCallback(
        new ServiceConfiguration.ConfigError("Service not configured")
      );
    return;
  }

  var credentialToken = Random.id();

  var loginUrl =
        METEORID_URL + "/oauth2/authorize?" +
        "state=" + credentialToken +
        "&response_type=code&" +
        "client_id=" + config.clientId +
        "&redirect_uri=" + Meteor.absoluteUrl("_oauth/meteorId/close");

  Oauth.showPopup(
    loginUrl,
    _.bind(credentialRequestCompleteCallback, null, credentialToken),
    { height: 406 }
  );
};
