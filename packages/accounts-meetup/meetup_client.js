Meteor.loginWithMeetup = function (options, callback) {
  // support both (options, callback) and (callback).
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'meetup'});
  if (!config) {
    callback && callback(new ServiceConfiguration.ConfigError("Service not configured"));
    return;
  }
  var state = Random.id();

  var scope = (options && options.requestPermissions) || [];
  var flatScope = _.map(scope, encodeURIComponent).join('+');

  var loginUrl =
        'https://secure.meetup.com/oauth2/authorize' +
        '?client_id=' + config.clientId +
        '&response_type=code' +
        '&scope=' + flatScope +
        '&redirect_uri=' + Meteor.absoluteUrl('_oauth/meetup?close') +
        '&state=' + state;

  // meetup box gets taller when permissions requested.
  var height = 620;
  if (_.without(scope, 'basic').length)
    height += 130;

  Accounts.oauth.initiateLogin(state, loginUrl, callback,
                               {width: 900, height: height});
};
