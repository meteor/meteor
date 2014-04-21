Tinytest.add("oauth1 - pendingCredential is stored and can be retrieved", function (test) {
  var http = Npm.require('http');
  var twitterfooId = Random.id();
  var twitterfooName = 'nickname' + Random.id();
  var twitterfooAccessToken = Random.id();
  var twitterfooAccessTokenSecret = Random.id();
  var twitterOption1 = Random.id();
  var credentialToken = Random.id();
  var serviceName = Random.id();

  var urls = {
    requestToken: "https://example.com/oauth/request_token",
    authorize: "https://example.com/oauth/authorize",
    accessToken: "https://example.com/oauth/access_token",
    authenticate: "https://example.com/oauth/authenticate"
  };

  OAuth1Binding.prototype.prepareRequestToken = function() {};
  OAuth1Binding.prototype.prepareAccessToken = function() {
    this.accessToken = twitterfooAccessToken;
    this.accessTokenSecret = twitterfooAccessTokenSecret;
  };

  ServiceConfiguration.configurations.insert({service: serviceName});

  try {
    // register a fake login service
    Oauth.registerService(serviceName, 1, urls, function (query) {
      return {
        serviceData: {
          id: twitterfooId,
          screenName: twitterfooName,
          accessToken: twitterfooAccessToken,
          accessTokenSecret: twitterfooAccessTokenSecret
        },
        options: {
          option1: twitterOption1
        }
      };
    });

    // simulate logging in using twitterfoo
    Oauth._storeRequestToken(credentialToken, twitterfooAccessToken);

    var req = {
      method: "POST",
      url: "/_oauth/" + serviceName + "?close",
      query: {
        state: credentialToken,
        oauth_token: twitterfooAccessToken
      }
    };
    OauthTest.middleware(req, new http.ServerResponse(req));

    // Test that the result for the token is available
    var result = Oauth._retrievePendingCredential(credentialToken);
    test.equal(result.serviceName, serviceName);
    test.equal(result.serviceData.id, twitterfooId);
    test.equal(result.serviceData.screenName, twitterfooName);
    test.equal(result.serviceData.accessToken, twitterfooAccessToken);
    test.equal(result.serviceData.accessTokenSecret, twitterfooAccessTokenSecret);
    test.equal(result.options.option1, twitterOption1);

    // Test that pending credential is removed after being retrieved
    result = Oauth._retrievePendingCredential(credentialToken);
    test.isUndefined(result);

  } finally {
    OauthTest.unregisterService(serviceName);
  }
});

