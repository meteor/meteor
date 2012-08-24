(function () {
  Meteor.loginWithFacebook = function () {
    if (!Meteor.accounts.facebook._appId || !Meteor.accounts.facebook._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.facebook.config first");

    var state = Meteor.uuid();
    var mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
    var display = mobile ? 'touch' : 'popup';

    var scope = "email";
    if (Meteor.accounts.facebook._options &&
        Meteor.accounts.facebook._options.scope)
      scope = Meteor.accounts.facebook._options.scope.join(',');

    var loginUrl =
          'https://www.facebook.com/dialog/oauth?client_id=' + Meteor.accounts.facebook._appId +
          '&redirect_uri=' + Meteor.accounts.facebook._appUrl + '/_oauth/facebook?close' +
          '&display=' + display + '&scope=' + scope + '&state=' + state;

    Meteor.accounts.oauth.initiateLogin(state, loginUrl);
  };

})();




