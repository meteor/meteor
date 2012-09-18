(function () {
  Meteor.loginWithGoogle = function () {
    var config = Meteor.accounts.configuration.findOne({service: 'google'});
    if (!config)
      throw new Meteor.accounts.ConfigError("Service not configured");

    var state = Meteor.uuid();

    // always need this to get user id from google.
    var required_scope = ['https://www.googleapis.com/auth/userinfo.profile'];
    var scope = ['https://www.googleapis.com/auth/userinfo.email'];
    if (Meteor.accounts.google._options &&
        Meteor.accounts.google._options.scope)
      scope = Meteor.accounts.google._options.scope;
    scope = _.union(scope, required_scope);
    var flat_scope = _.map(scope, encodeURIComponent).join('+');

    // Might be good to have a way to set access_type=offline. Need to
    // both set it here and store the refresh token on the server.

    var loginUrl =
          'https://accounts.google.com/o/oauth2/auth' +
          '?response_type=code' +
          '&client_id=' + config.clientId +
          '&scope=' + flat_scope +
          '&redirect_uri=' + Meteor.absoluteUrl('_oauth/google?close') +
          '&state=' + state;

    Meteor.accounts.oauth.initiateLogin(state, loginUrl);
  };

}) ();
