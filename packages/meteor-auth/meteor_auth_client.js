MeteorAccounts = {};

// Request Meteor Accounts credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
// Options:
// - _redirectToLogin (boolean): uses a redirect to take the user to Meteor
//   Accounts instead of a popup
// - _redirectUrl (string): a url to redirect to for handling the authorization
//   code, instead of the default which goes to the registered service handler
// - _state (object): extra state to append to the authorization code
//   request. The state will be stringified and prepended to other state with a
//   comma. (i.e., the actual state parameter used will be <stringified state
//   from objects>,<other state>).
// XXX It's very possible that there are only a few permutations of these
// options that make sense. For instance, our oauth server code only really
// handles the popup flow, so setting _redirectToLogin but not setting
// _redirectUrl won't work. Also, passing a credentialRequestCompleteCallback
// and also setting options._redirectToLogin doesn't make sense because the
// callback will never get called.
MeteorAccounts.requestCredential = function (options, credentialRequestCompleteCallback) {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options;
    options = {};
  } else if (!options) {
    options = {};
  }

  var config = ServiceConfiguration.configurations.findOne({service: 'meteor'});
  if (!config) {
    credentialRequestCompleteCallback &&
      credentialRequestCompleteCallback(
        new ServiceConfiguration.ConfigError("Service not configured")
      );
    return;
  }

  var credentialToken = Random.id();
  var state = (options._state ?
               JSON.stringify(state) + "," + credentialToken :
               credentialToken);

  var loginUrl =
        "https://accounts.meteor.com/authorize?" +
        "state=" + state +
        "&response_type=code&" +
        "client_id=" + config.clientId +
        "&redirect_uri=" +
        (options._redirectUrl || Meteor.absoluteUrl("_oauth/meteor/close", {
          secure: true
        }));
  if (options._redirectToLogin) {
    window.location.assign(loginUrl);
  } else {
    Oauth.initiateLogin(credentialToken,
                        loginUrl,
                        credentialRequestCompleteCallback,
                        { height: 406 });
  }
};
