(function () {

  // Open a popup window to let the user log in via Twitter
  // By default it creates/updates (upserts) a Meteor user with the results, and logs
  //   them in with the user.
  //
  // XXX support options.requestPermissions as we do for Facebook, Google, Github
  //
  // @param options
  //   - skipUserUpsert - Setting to true means a Meteor User obect isn't upserted
  //                      with the twitter login results
  //   - replacementCallbackForAfterPopupClosed
  //                    - If provided, it skips the Meteor Login, and uses this callback instead.
  //                      The replacementCallback is passed a state string and callback provided here
  //                      The oauth credentials can then be retrieved on the server via:
  //                              Accounts.oauth._loginResultForState[state]
  //                      and will be in the form [service, oauthData, oauthOptions]
  // @param callback  ??

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

    var state = Random.id();
    // We need to keep state across the next two 'steps' so we're adding
    // a state parameter to the url and the callback url that we'll be returned
    // to by oauth provider

    // url back to app, enters "step 2" as described in
    // packages/accounts-oauth1-helper/oauth1_server.js
    var callbackPath = '_oauth/twitter?close&state=' + state;
    if(options.skipUserUpsert === true) {
      callbackPath += '&skipUserUpsert=true'
    }

    var callbackUrl = Meteor.absoluteUrl(callbackPath);

    // url to app, enters "step 1" as described in
    // packages/accounts-oauth1-helper/oauth1_server.js
    var url = '/_oauth/twitter/?requestTokenAndRedirect='
          + encodeURIComponent(callbackUrl)
          + '&state=' + state;


    Accounts.oauth.initiateLogin(state, url, callback, null, options.replacementCallbackForAfterPopupClosed);
  };
})();
