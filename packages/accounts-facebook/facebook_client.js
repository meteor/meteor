(function () {
  Meteor.loginWithFacebook = function () {
    if (!Meteor.accounts.facebook._appId || !Meteor.accounts.facebook._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.facebook.config first");

    var state = Meteor.uuid();
    // XXX I think there's a smaller popup. Replace with appropriate URL.

    var scope = "email";
    if (Meteor.accounts.facebook._options &&
        Meteor.accounts.facebook._options.scope)
      scope = Meteor.accounts.facebook._options.scope.join(',');

    var loginUrl =
          'https://www.facebook.com/dialog/oauth?client_id=' + Meteor.accounts.facebook._appId +
          '&redirect_uri=' + Meteor.accounts.facebook._appUrl + '/_oauth/facebook?close' +
          '&scope=' + scope + '&state=' + state;

    Meteor.accounts.oauth2.initiateLogin(state, loginUrl);
  };

})();




