Google.requestCredential = function (options, callback, loginPopupClosedCallback) {
  // support both (options, callback) and (callback).
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  } else if (!options) {
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'google'});
  if (!config) {
    callback && callback(new ServiceConfiguration.ConfigError("Service not configured"));
    return;
  }

  var state = Random.id();

  // always need this to get user id from google.
  var requiredScope = ['https://www.googleapis.com/auth/userinfo.profile'];
  var scope = ['https://www.googleapis.com/auth/userinfo.email'];
  if (options.requestPermissions)
    scope = options.requestPermissions;
  scope = _.union(scope, requiredScope);
  var flatScope = _.map(scope, encodeURIComponent).join('+');

  // https://developers.google.com/accounts/docs/OAuth2WebServer#formingtheurl
  var accessType = options.requestOfflineToken ? 'offline' : 'online';

  var loginUrl =
        'https://accounts.google.com/o/oauth2/auth' +
        '?response_type=code' +
        '&client_id=' + config.clientId +
        '&scope=' + flatScope +
        '&redirect_uri=' + Meteor.absoluteUrl('_oauth/google?close') +
        '&state=' + state +
        '&access_type=' + accessType;

  Oauth.initiateLogin(state, loginUrl, callback, loginPopupClosedCallback);
};
