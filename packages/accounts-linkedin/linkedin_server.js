(function () {

  Accounts.oauth.registerService('linkedin', 1, function(oauthBinding) {
    var identity = oauthBinding.get('http://api.linkedin.com/v1/people/~?format=json');

    return {
      serviceData: {
        id: identity.id,
        name: identity.formatted-name,
        accessToken: oauthBinding.accessToken,
        accessTokenSecret: oauthBinding.accessTokenSecret
      },
      options: {
        profile: {
          name: identity.formatted-name
        }
      }
    };
  });
}) ();
