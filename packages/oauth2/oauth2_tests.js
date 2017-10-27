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
          secretStuff: OAuth.sealSecret("confidential")
        },
        options: {option1: foobookOption1}
      };
    });

    // simulate logging in using foobook
    var req = {method: "POST",
               url: "/_oauth/" + serviceName,
               query: {
                 state: OAuth._generateState('popup', credentialToken),
                 close: 1,
                 only_credential_secret_for_test: 1
               }};
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
    OAuthEncryption.loadKey(Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]).toString("base64"));
    testPendingCredential(test);
  } finally {
    OAuthEncryption.loadKey(null);
  }
});
