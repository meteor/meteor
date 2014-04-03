Tinytest.add("oauth2 - pendingCredential  is stored and can be retrieved", function (test) {
  var http = Npm.require('http');
  var foobookId = Random.id();
  var foobookOption1 = Random.id();
  var credentialToken = Random.id();
  var serviceName = Random.id();

  ServiceConfiguration.configurations.insert({service: serviceName});

  try {
    // register a fake login service
    Oauth.registerService(serviceName, 2, null, function (query) {
      return {
        serviceData: {id: foobookId},
        options: {option1: foobookOption1}
      };
    });

    // simulate logging in using foobook
    var req = {method: "POST",
               url: "/_oauth/" + serviceName + "?close",
               query: {state: credentialToken}};
    OauthTest.middleware(req, new http.ServerResponse(req));

    // Test that the result for the token is available
    var result = Oauth._retrievePendingCredential(credentialToken);
    test.equal(result.serviceName, serviceName);
    test.equal(result.serviceData.id, foobookId);
    test.equal(result.options.option1, foobookOption1);

    // Test that pending credential is removed after being retrieved
    result = Oauth._retrievePendingCredential(credentialToken);
    test.isUndefined(result);

  } finally {
    OauthTest.unregisterService(serviceName);
  }
});
