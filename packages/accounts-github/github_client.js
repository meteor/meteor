(function () {
  Meteor.loginWithGithub = function (options, callback) {
    // support both (options, callback) and (callback).
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }

    var config = Accounts.loginServiceConfiguration.findOne({service: 'github'});
    if (!config) {
      callback && callback(new Accounts.ConfigError("Service not configured"));
      return;
    }
    var state = Meteor.uuid();

    var scope = (options && options.requestPermissions) || [];
    var flatScope = _.map(scope, encodeURIComponent).join('+');

    var loginUrl =
	  'https://github.com/login/oauth/authorize' +
	  '?client_id=' + config.clientId +
	  '&scope=' + flatScope +
	  '&redirect_uri=' + Meteor.absoluteUrl('_oauth/github?close') +
	  '&state=' + state;

    Accounts.oauth.initiateLogin(state, loginUrl, callback, {width: 900, height: 450});
  };
}) ();
