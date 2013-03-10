(function () {
  Meteor.loginWithMeetup = function (options, callback) {
    // support both (options, callback) and (callback).
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }

    var config = Accounts.loginServiceConfiguration.findOne({service: 'meetup'});
    if (!config) {
      callback && callback(new Accounts.ConfigError("Service not configured"));
      return;
    }
    var state = Random.id();

    var loginUrl =
	  'https://secure.meetup.com/oauth2/authorize' +
	  '?client_id=' + config.clientId +
          '&response_type=code' +
	  '&redirect_uri=' + Meteor.absoluteUrl('_oauth/meetup?close') +
	  '&state=' + state;

    Accounts.oauth.initiateLogin(state, loginUrl, callback, {width: 900, height: 450});
  };
}) ();
