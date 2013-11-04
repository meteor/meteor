Twitter = {};

// Request Twitter credentials for the user
// @param options {optional Object} with fields:
// - requestPermissions {'read' or 'write'}
//     Request a specific permission level from Twitter (Twitter's x_auth_access_type)
//     If you nead RWD, leave this blank, and configure it in your Twitter app config
// - forceLogin {Boolean}
//     If true, tells Twitter to prompt for a new login
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Twitter.requestCredential = function (options, credentialRequestCompleteCallback) {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'twitter'});
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(new ServiceConfiguration.ConfigError("Service not configured"));
    return;
  }

  var credentialToken = Random.id();
  // We need to keep credentialToken across the next two 'steps' so we're adding
  // a credentialToken parameter to the url and the callback url that we'll be returned
  // to by oauth provider

  // url back to app, enters "step 2" as described in
  // packages/accounts-oauth1-helper/oauth1_server.js
  var callbackUrl = Meteor.absoluteUrl('_oauth/twitter?close&state=' + credentialToken);

  // url to app, enters "step 1" as described in
  // packages/accounts-oauth1-helper/oauth1_server.js
  var url = '/_oauth/twitter/?requestTokenAndRedirect='
        + encodeURIComponent(callbackUrl)
        + '&state=' + credentialToken;

  // Prepare authentication options
  var authenticationOptions = [];

  if (options.forceLogin === true) {
    url += '&force_login=true';
    authenticationOptions.push('force_login');
  }

  if (authenticationOptions.length > 0)
    url += '&authenticationOptions=' + authenticationOptions.join(',');

  // Prepare request token options
  var requestTokenOptions = [];

  if (options.requestPermissions) {
    url += '&x_auth_access_type=' + options.requestPermissions;
    requestTokenOptions.push('x_auth_access_type');
  }

  if (requestTokenOptions.length > 0)
    url += '&requestTokenOptions=' + requestTokenOptions.join(',');

  // Initiate the login
  Oauth.initiateLogin(credentialToken, url, credentialRequestCompleteCallback);
};
