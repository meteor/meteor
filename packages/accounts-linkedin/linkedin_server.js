(function () {

  Accounts.oauth.registerService('linkedin', 1, function(oauthBinding) {
    var identity = oauthBinding.get('http://api.linkedin.com/v1/people/~?format=json');

    return {
      serviceData: {
        id: identity.id,
        screenName: identity.id,
        accessToken: oauthBinding.accessToken,
        accessTokenSecret: oauthBinding.accessTokenSecret
      },
      options: {
        profile: {
          name: formatted-name
        }
      }
    };
  });
}) ();
