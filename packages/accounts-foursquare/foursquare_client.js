Meteor.loginWithFoursquare = function (options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  }

	var config = Accounts.loginServiceConfiguration.findOne({service: 'foursquare'});
	if (!config) {
		callback && callback(new Accounts.ConfigError("Service not configured"));
		return;
	}
	var state = Random.id();
	
	var loginUrl =
	      'https://foursquare.com/oauth2/authenticate' +
	      '?client_id=' + config.clientId +
	      '&redirect_uri=' + Meteor.absoluteUrl('_oauth/foursquare?close') +
	      '&response_type=code' +
        '&state=' + state;
	
  Accounts.oauth.initiateLogin(state, loginUrl, callback, {width: 900, height: 450});
};
