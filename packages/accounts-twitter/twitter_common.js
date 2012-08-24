if (!Meteor.accounts.twitter) {
  Meteor.accounts.twitter = {};
  Meteor.accounts.twitter._requireConfigs = ['_consumerKey', '_appUrl'];
}

Meteor.accounts.twitter.config = function(consumerKey, appUrl) {
  Meteor.accounts.twitter._consumerKey = consumerKey;
  Meteor.accounts.twitter._appUrl = appUrl;
};

Meteor.accounts.twitter._urls = {
  requestToken: "https://api.twitter.com/oauth/request_token",
  authorize: "https://api.twitter.com/oauth/authorize",
  accessToken: "https://api.twitter.com/oauth/access_token",
  authenticate: "https://api.twitter.com/oauth/authenticate"
};
