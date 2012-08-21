(function () {
  Meteor.loginWithTwitter = function () {
    if (!Meteor.accounts.twitter._appId || !Meteor.accounts.twitter._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.twitter.config first");

    var state = Meteor.uuid();
    // We need to keep state across the next two 'steps' so we're adding
    // a state parameter to the url and the callback url that we'll be returned
    // to by oauth provider
    var callbackUrl = Meteor.accounts.twitter._appUrl + '/_oauth/twitter?close&state=' + state;
    var url = '/_oauth/twitter/request_token?callbackUrl=' + encodeURIComponent(callbackUrl) + '&state=' + state

    Meteor.accounts.oauth.initiateLogin(state, url);
  };

})();
