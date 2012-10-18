(function () {
  Meteor.loginWithFacebook = function (options, callback) {
    // support both (options, callback) and (callback).
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }

    var config = Accounts.loginServiceConfiguration.findOne({service: 'facebook'});
    if (!config) {
      callback && callback(new Accounts.ConfigError("Service not configured"));
      return;
    }

    var state = Meteor.uuid();
    var mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
    var display = mobile ? 'touch' : 'popup';

    var scope = "email";
    if (options && options.requestPermissions)
      scope = options.requestPermissions.join(',');

    var loginUrl =
          'https://www.facebook.com/dialog/oauth?client_id=' + config.appId +
          '&redirect_uri=' + Meteor.absoluteUrl('_oauth/facebook?close') +
          '&display=' + display + '&scope=' + scope + '&state=' + state;

    Accounts.oauth.initiateLogin(state, loginUrl, callback);
  };

})();




