(function () {
  Meteor.loginWithTwitter = function () {
    if (!Meteor.accounts.twitter._appId || !Meteor.accounts.twitter._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.twitter.config first");

    var state = Meteor.uuid();
    var callbackUrl = Meteor.accounts.twitter._appUrl + '/_oauth/twitter?close&state=' + state;
    var url = '/_oauth/twitter/request_token?callbackUrl=' + encodeURIComponent(callbackUrl)

    Meteor.accounts.oauth.initiateLogin(state, url, { version: 1 });
  };

})();
