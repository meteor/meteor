(function () {
  Meteor.loginWithFacebook = function () {
    if (!Meteor.accounts.facebook._appId || !Meteor.accounts.facebook._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.facebook.config first");

    var state = Meteor.uuid();
    // XXX I think there's a smaller popup. Replace with appropriate URL.
    // XXX need to support configuring scope
    var loginUrl =
          'https://www.facebook.com/dialog/oauth?client_id=' + Meteor.accounts.facebook._appId +
          '&redirect_uri=' + Meteor.accounts.facebook._appUrl + '/_oauth/facebook?close' +
          '&scope=email&state=' + state;

    Meteor.accounts.oauth2.initiateLogin(state, loginUrl);
  };

})();




