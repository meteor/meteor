(function() {
  Meteor.loginWithQQ = function() {
    if (!Meteor.accounts.qq._clientId || !Meteor.accounts.qq._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.qq.config first");

    var state = Meteor.uuid();
    // XXX need to support configuring access_type and scope
    var loginUrl = 'https://graph.qq.com/oauth2.0/authorize' + '?response_type=code' + '&client_id=' + Meteor.accounts.qq._clientId + '&redirect_uri=' + Meteor.accounts.qq._appUrl + '/_oauth/qq?close' + '&state=' + state;

    Meteor.accounts.oauth.initiateLogin(state, loginUrl);
  };

})();
