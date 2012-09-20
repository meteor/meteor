(function() {
  Meteor.loginWithQQ = function() {
    var config = Meteor.accounts.configuration.findOne({service: 'qq'});
    if (!config)
      throw new Meteor.accounts.ConfigError("Service not configured");
    var state = Meteor.uuid();
    // XXX need to support configuring access_type and scope
    var loginUrl = 'https://graph.qq.com/oauth2.0/authorize' + '?response_type=code' + '&client_id=' + config.clientId + '&redirect_uri=' + Meteor.absoluteUrl('_oauth/qq?close') + '&state=' + state;

    Meteor.accounts.oauth.initiateLogin(state, loginUrl);
  };

})();
