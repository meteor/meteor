Github = {};

// Request Github credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Github.requestCredential = function (options, credentialRequestCompleteCallback) {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'github'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(new ServiceConfiguration.ConfigError("Service not configured"));
    return;
  }
  var credentialToken = Random.id();

  var scope = (options && options.requestPermissions) || [];
  var flatScope = _.map(scope, encodeURIComponent).join('+');

  var loginUrl =
        'https://github.com/login/oauth/authorize' +
        '?client_id=' + config.clientId +
        '&scope=' + flatScope +
        '&redirect_uri=' + Meteor.absoluteUrl('_oauth/github?close') +
        '&state=' + credentialToken;


  Oauth.showPopup(
    loginUrl,
    _.bind(credentialRequestCompleteCallback, null, credentialToken),
    {width: 900, height: 450}
  );
};
