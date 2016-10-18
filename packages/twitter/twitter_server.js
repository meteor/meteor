var urls = {
  requestToken: "https://api.twitter.com/oauth/request_token",
  authorize: "https://api.twitter.com/oauth/authorize",
  accessToken: "https://api.twitter.com/oauth/access_token",
  authenticate: function (oauthBinding, params) {
    return OAuth._queryParamsWithAuthTokenUrl(
      "https://api.twitter.com/oauth/authenticate",
      oauthBinding,
      params,
      Twitter.validParamsAuthenticate
    );
  }
};

// https://dev.twitter.com/docs/api/1.1/get/account/verify_credentials
Twitter.whitelistedFields = ['profile_image_url', 'profile_image_url_https', 'lang', 'email'];

OAuth.registerService('twitter', 1, urls, function(oauthBinding) {
  var identity = oauthBinding.get('https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true').data;

  var serviceData = {
    id: identity.id_str,
    screenName: identity.screen_name,
    accessToken: OAuth.sealSecret(oauthBinding.accessToken),
    accessTokenSecret: OAuth.sealSecret(oauthBinding.accessTokenSecret)
  };

  // include helpful fields from twitter
  var fields = _.pick(identity, Twitter.whitelistedFields);
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


Twitter.retrieveCredential = function(credentialToken, credentialSecret) {
  return OAuth.retrieveCredential(credentialToken, credentialSecret);
};
