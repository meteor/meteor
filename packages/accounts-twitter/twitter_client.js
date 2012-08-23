(function () {
  Meteor.loginWithTwitter = function () {
    if (!Meteor.accounts.twitter._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.twitter.config first");

    var state = Meteor.uuid();
    // We need to keep state across the next two 'steps' so we're adding
    // a state parameter to the url and the callback url that we'll be returned
    // to by oauth provider

    // url back to app, enters "step 2" as described in
    // packages/accounts-oauth1-helper/oauth1_server.js
    var callbackUrl = Meteor.accounts.twitter._appUrl + '/_oauth/twitter?close&state=' + state;

    // url to app, enters "step 1" as described in
    // packages/accounts-oauth1-helper/oauth1_server.js
    var url = '/_oauth/twitter/?requestTokenAndRedirect=' + encodeURIComponent(callbackUrl)
          + '&state=' + state;

    Meteor.accounts.oauth.initiateLogin(state, url);
  };

})();
