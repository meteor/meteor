(function () {
  Meteor.loginWithGithub = function (callback) {
    var config = Accounts.configuration.findOne({service: 'github'});
    if (!config) {
      callback && callback(new Accounts.ConfigError("Service not configured"));
      return;
    }
    var state = Meteor.uuid();

    var required_scope = ['user'];
    var scope = [];
    if (Accounts.github._options && Accounts.github._options.scope)
      scope = Accounts.github._options.scope;
    scope = _.union(scope, required_scope);
    var flat_scope = _.map(scope, encodeURIComponent).join('+');

    var loginUrl =
	  'https://github.com/login/oauth/authorize' +
	  '?client_id=' + config.clientId +
	  '&scope=' + flat_scope +
	  '&redirect_uri=' + Meteor.absoluteUrl('_oauth/github?close') +
	  '&state=' + state;

    Accounts.oauth.initiateLogin(state, loginUrl, callback);
  };
}) ();
