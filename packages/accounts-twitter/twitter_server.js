// https://dev.twitter.com/docs/api/1.1/get/account/verify_credentials
var whitelisted = ['profile_image_url', 'profile_image_url_https', 'lang'];

var autopublishedFields = _.map(
  // don't send access token. https://dev.twitter.com/discussions/5025
  whitelisted.concat(['id', 'screenName']),
  function (subfield) { return 'services.twitter.' + subfield; });

Accounts.addAutopublishFields({
  forLoggedInUser: autopublishedFields,
  forOtherUsers: autopublishedFields
});

Accounts.oauth.registerService('twitter', 1, function(oauthBinding) {
  var identity = oauthBinding.get('https://api.twitter.com/1.1/account/verify_credentials.json').data;

  var serviceData = {
    id: identity.id_str,
    screenName: identity.screen_name,
    accessToken: oauthBinding.accessToken,
    accessTokenSecret: oauthBinding.accessTokenSecret
  };

  // include helpful fields from twitter
  var fields = _.pick(identity, whitelisted);
  _.extend(serviceData, fields);

  return {
    serviceData: serviceData,
    options: {
      profile: {
        name: identity.name
      }
    }
  };
});
