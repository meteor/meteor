(function () {
  Meteor.loginWithTwitter = function () {
    if (!Meteor.accounts.twitter._appId || !Meteor.accounts.twitter._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.twitter.config first");

    var state = Meteor.uuid();
    var callbackUrl = Meteor.accounts.twitter._appUrl + '/_oauth1/twitter?close&state=' + state;
    var url = '/_oauth1/twitter/request_token?callbackUrl=' + encodeURIComponent(callbackUrl)

    Meteor.accounts.oauth1.initiateLogin(state, url);
  };

})();
