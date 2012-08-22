if (!Meteor.accounts.twitter) {
  Meteor.accounts.twitter = {};
  Meteor.accounts.twitter._requireConfigs = ['_appId', '_appUrl'];
}

Meteor.accounts.twitter.config = function(appId, appUrl, options) {
  Meteor.accounts.twitter._appId = appId;
  Meteor.accounts.twitter._appUrl = appUrl;
  Meteor.accounts.twitter._options = options;
  
  Meteor.accounts.twitter._urls = {
    requestToken: "https://api.twitter.com/oauth/request_token",
    authorize: "https://api.twitter.com/oauth/authorize",
    accessToken: "https://api.twitter.com/oauth/access_token",
    authenticate: "https://api.twitter.com/oauth/authenticate"
  };
};
