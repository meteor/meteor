(function () {
  Meteor.loginWithFacebook = function () {
    var config = Meteor.accounts.configuration.findOne({service: 'facebook'});
    if (!config)
      throw new Meteor.accounts.ConfigError("Service not configured");

    var state = Meteor.uuid();
    var mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
    var display = mobile ? 'touch' : 'popup';

    var scope = "email";
    if (Meteor.accounts.facebook._options &&
        Meteor.accounts.facebook._options.scope)
      scope = Meteor.accounts.facebook._options.scope.join(',');

    var loginUrl =
          'https://www.facebook.com/dialog/oauth?client_id=' + config.appId +
          '&redirect_uri=' + Meteor.absoluteUrl('_oauth/facebook?close') +
          '&display=' + display + '&scope=' + scope + '&state=' + state;

    Meteor.accounts.oauth.initiateLogin(state, loginUrl);
  };

})();




