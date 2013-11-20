Meetup = {};
// Request Meetup credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Meetup.requestCredential = function (options, credentialRequestCompleteCallback) {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'meetup'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(new ServiceConfiguration.ConfigError("Service not configured"));
    return;
  }
  var credentialToken = Random.id();

  var scope = (options && options.requestPermissions) || [];
  var flatScope = _.map(scope, encodeURIComponent).join('+');

  var loginUrl =
        'https://secure.meetup.com/oauth2/authorize' +
        '?client_id=' + config.clientId +
        '&response_type=code' +
        '&scope=' + flatScope +
        '&redirect_uri=' + Meteor.absoluteUrl('_oauth/meetup?close') +
        '&state=' + credentialToken;

  // meetup box gets taller when permissions requested.
  var height = 620;
  if (_.without(scope, 'basic').length)
    height += 130;

  Oauth.showPopup(
    loginUrl,
    _.bind(credentialRequestCompleteCallback, null, credentialToken),
    {width: 900, height: height}
  );
};
