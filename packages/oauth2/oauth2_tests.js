Tinytest.add("oauth2 - loginResultForCredentialToken is stored", function (test) {
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

    // Test that the login result for that user is prepared
    test.equal(
      Oauth._loginResultForCredentialToken[credentialToken].serviceName, serviceName);
    test.equal(
      Oauth._loginResultForCredentialToken[credentialToken].serviceData.id, foobookId);
    test.equal(
      Oauth._loginResultForCredentialToken[credentialToken].options.option1, foobookOption1);

  } finally {
    OauthTest.unregisterService(serviceName);
  }
});
