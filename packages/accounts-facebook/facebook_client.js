(function () {
  Meteor.loginWithFacebook = function (callback) {
    var config = Accounts.configuration.findOne({service: 'facebook'});
    if (!config) {
      callback && callback(new Accounts.ConfigError("Service not configured"));
      return;
    }

    var state = Meteor.uuid();
    var mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
    var display = mobile ? 'touch' : 'popup';

    var scope = "email";
    if (Accounts.facebook._options &&
        Accounts.facebook._options.scope)
      scope = Accounts.facebook._options.scope.join(',');

    var loginUrl =
          'https://www.facebook.com/dialog/oauth?client_id=' + config.appId +
          '&redirect_uri=' + Meteor.absoluteUrl('_oauth/facebook?close') +
          '&display=' + display + '&scope=' + scope + '&state=' + state;

    Accounts.oauth.initiateLogin(state, loginUrl, callback);
  };

})();




