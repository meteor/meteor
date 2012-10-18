(function () {
  // XXX support options.requestPermissions as we do for Facebook, Google, Github
  Meteor.loginWithTwitter = function (options, callback) {
    // support both (options, callback) and (callback).
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }

    var config = Accounts.loginServiceConfiguration.findOne({service: 'twitter'});
    if (!config) {
      callback && callback(new Accounts.ConfigError("Service not configured"));
      return;
    }

    var state = Meteor.uuid();
    // We need to keep state across the next two 'steps' so we're adding
    // a state parameter to the url and the callback url that we'll be returned
    // to by oauth provider

    // url back to app, enters "step 2" as described in
    // packages/accounts-oauth1-helper/oauth1_server.js
    var callbackUrl = Meteor.absoluteUrl('_oauth/twitter?close&state=' + state);

    // url to app, enters "step 1" as described in
    // packages/accounts-oauth1-helper/oauth1_server.js
    var url = '/_oauth/twitter/?requestTokenAndRedirect='
          + encodeURIComponent(callbackUrl)
          + '&state=' + state;

    Accounts.oauth.initiateLogin(state, url, callback);
  };

})();
