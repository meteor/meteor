var testPendingCredential = function (test) {
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
    OAuth.registerService(serviceName, 1, urls, function (query) {
      return {
        serviceData: {
          id: twitterfooId,
          screenName: twitterfooName,
          accessToken: OAuth.sealSecret(twitterfooAccessToken),
          accessTokenSecret: OAuth.sealSecret(twitterfooAccessTokenSecret)
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
      url: "/_oauth/" + serviceName,
      query: {
        state: OAuth._generateState('popup', credentialToken),
        oauth_token: twitterfooAccessToken,
        only_credential_secret_for_test: 1
      }
    };
    var res = new http.ServerResponse(req);
    var write = res.write;
    var end = res.write;
    var respData = "";
    res.write = function (data, encoding, callback) {
      respData += data;
      return write.apply(this, arguments);
    };
    res.end = function (data) {
      respData += data;
      return end.apply(this, arguments);
    };
    OAuthTest.middleware(req, res);
    var credentialSecret = respData;

    // Test that the result for the token is available
    var result = OAuth._retrievePendingCredential(credentialToken,
                                                  credentialSecret);
    var serviceData = OAuth.openSecrets(result.serviceData);
    test.equal(result.serviceName, serviceName);
    test.equal(serviceData.id, twitterfooId);
    test.equal(serviceData.screenName, twitterfooName);
    test.equal(serviceData.accessToken, twitterfooAccessToken);
    test.equal(serviceData.accessTokenSecret, twitterfooAccessTokenSecret);
    test.equal(result.options.option1, twitterOption1);

    // Test that pending credential is removed after being retrieved
    result = OAuth._retrievePendingCredential(credentialToken);
    test.isUndefined(result);

  } finally {
    OAuthTest.unregisterService(serviceName);
  }
};

Tinytest.add("oauth1 - pendingCredential is stored and can be retrieved (without oauth encryption)", function (test) {
  OAuthEncryption.loadKey(null);
  testPendingCredential(test);
});

Tinytest.add("oauth1 - pendingCredential is stored and can be retrieved (with oauth encryption)", function (test) {
  try {
    OAuthEncryption.loadKey(Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]).toString("base64"));
    testPendingCredential(test);
  } finally {
    OAuthEncryption.loadKey(null);
  }
});

Tinytest.add("oauth1 - duplicate key for request token", function (test) {
  var key = Random.id();
  var token = Random.id();
  var secret = Random.id();
  OAuth._storeRequestToken(key, token, secret);
  var newToken = Random.id();
  var newSecret = Random.id();
  OAuth._storeRequestToken(key, newToken, newSecret);
  var result = OAuth._retrieveRequestToken(key);
  test.equal(result.requestToken, newToken);
  test.equal(result.requestTokenSecret, newSecret);
});

Tinytest.add("oauth1 - null, undefined key for request token", function (test) {
  var token = Random.id();
  var secret = Random.id();
  test.throws(function () {
    OAuth._storeRequestToken(null, token, secret);
  });
  test.throws(function () {
    OAuth._storeRequestToken(undefined, token, secret);
  });
});
