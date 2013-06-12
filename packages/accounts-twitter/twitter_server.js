Accounts.oauth.registerService('twitter');

var autopublishedFields = _.map(
  // don't send access token. https://dev.twitter.com/discussions/5025
  Twitter.whitelistedFields.concat(['id', 'screenName']),
  function (subfield) { return 'services.twitter.' + subfield; });

Accounts.addAutopublishFields({
  forLoggedInUser: autopublishedFields,
  forOtherUsers: autopublishedFields
});
