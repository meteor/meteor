Facebook.requestCredential = function (options, callback, loginPopupClosedCallback) {
  // support both (options, callback) and (callback).
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'facebook'});
  if (!config) {
    callback && callback(new ServiceConfiguration.ConfigError("Service not configured"));
    return;
  }

  var state = Random.id();
  var mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
  var display = mobile ? 'touch' : 'popup';

  var scope = "email";
  if (options && options.requestPermissions)
    scope = options.requestPermissions.join(',');

  var loginUrl =
        'https://www.facebook.com/dialog/oauth?client_id=' + config.appId +
        '&redirect_uri=' + Meteor.absoluteUrl('_oauth/facebook?close') +
        '&display=' + display + '&scope=' + scope + '&state=' + state;

  Oauth.initiateLogin(state, loginUrl, callback, loginPopupClosedCallback);
};
