(function () {

  Accounts.oauth.registerService('twitter', 1, function(oauthBinding) {
    var identity = oauthBinding.get('https://api.twitter.com/1/account/verify_credentials.json');

    return {
      serviceData: {
        id: identity.id,
        screenName: identity.screen_name,
        accessToken: oauthBinding.accessToken,
        accessTokenSecret: oauthBinding.accessTokenSecret
      },
      options: {
        profile: {
          name: identity.name
        }
      }
    };
  });
}) ();
