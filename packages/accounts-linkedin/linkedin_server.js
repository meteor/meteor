(function () {

  Accounts.oauth.registerService('linkedin', 1, function(oauthBinding) {
    var identity = oauthBinding.get('http://api.linkedin.com/v1/people/~');

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
