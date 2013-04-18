// with autopublish on: publish all fields other than access token and
// secret to the user; only the user's twitter screenName and profile
// images to others
Accounts._autopublishFields.loggedInUser.push('services.twitter.id');
Accounts._autopublishFields.loggedInUser.push('services.twitter.screenName');
Accounts._autopublishFields.loggedInUser.push('services.twitter.lang');
Accounts._autopublishFields.loggedInUser.push('services.twitter.profile_image_url');
Accounts._autopublishFields.loggedInUser.push('services.twitter.profile_image_url_https');
Accounts._autopublishFields.allUsers.push('services.twitter.screenName');
Accounts._autopublishFields.allUsers.push('services.twitter.profile_image_url');
Accounts._autopublishFields.allUsers.push('services.twitter.profile_image_url_https');

Accounts.oauth.registerService('twitter', 1, function(oauthBinding) {
  var identity = oauthBinding.get('https://api.twitter.com/1.1/account/verify_credentials.json').data;

  var serviceData = {
    id: identity.id_str,
    screenName: identity.screen_name,
    accessToken: oauthBinding.accessToken,
    accessTokenSecret: oauthBinding.accessTokenSecret
  };

  // include helpful fields from twitter
  // https://dev.twitter.com/docs/api/1.1/get/account/verify_credentials
  var whitelisted = ['profile_image_url', 'profile_image_url_https', 'lang'];

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
