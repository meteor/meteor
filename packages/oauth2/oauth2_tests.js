var testPendingCredential = function (test) {
  var http = Npm.require('http');
  var foobookId = Random.id();
  var foobookOption1 = Random.id();
  var credentialToken = Random.id();
  var serviceName = Random.id();

  ServiceConfiguration.configurations.insert({service: serviceName});

  try {
    // register a fake login service
    OAuth.registerService(serviceName, 2, null, function (query) {
      return {
        serviceData: {
          id: foobookId,
          secretStuff: {seal: "confidential"}
        },
        options: {option1: foobookOption1}
      };
    });

    // simulate logging in using foobook
    var req = {method: "POST",
               url: "/_oauth/" + serviceName + "?close",
               query: {state: credentialToken}};
    OAuthTest.middleware(req, new http.ServerResponse(req));

    // Test that the result for the token is available
    var result = OAuth._retrievePendingCredential(credentialToken);
    var serviceData = OAuth._openSecrets(result.serviceData);
    test.equal(result.serviceName, serviceName);
    test.equal(serviceData.id, foobookId);
    test.equal(serviceData.secretStuff, 'confidential');
    test.equal(result.options.option1, foobookOption1);

    // Test that pending credential is removed after being retrieved
    result = OAuth._retrievePendingCredential(credentialToken);
    test.isUndefined(result);

  } finally {
    OAuthTest.unregisterService(serviceName);
  }
};

Tinytest.add("oauth2 - pendingCredential is stored and can be retrieved (without oauth encryption)", function (test) {
  OAuthEncryption.loadKey(null);
  testPendingCredential(test);
});

Tinytest.add("oauth2 - pendingCredential is stored and can be retrieved (with oauth encryption)", function (test) {
  try {
    OAuthEncryption.loadKey(new Buffer([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]).toString("base64"));
    testPendingCredential(test);
  } finally {
    OAuthEncryption.loadKey(null);
  }
});
