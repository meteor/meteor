import http from 'http';

const testPendingCredential = function (test) {
  const foobookId = Random.id();
  const foobookOption1 = Random.id();
  const credentialToken = Random.id();
  const serviceName = Random.id();

  ServiceConfiguration.configurations.insert({service: serviceName});

  try {
    // register a fake login service
    OAuth.registerService(serviceName, 2, null, query => {
      return {
        serviceData: {
          id: foobookId,
          secretStuff: OAuth.sealSecret("confidential")
        },
        options: {option1: foobookOption1}
      };
    });

    // simulate logging in using foobook
    const req = {method: "POST",
               url: `/_oauth/${serviceName}`,
               query: {
                 state: OAuth._generateState('popup', credentialToken),
                 close: 1,
                 only_credential_secret_for_test: 1
               }};
    const res = new http.ServerResponse(req);
    const write = res.write;
    const end = res.end;
    let respData = "";
    res.write = (...args) => {
      respData += args[0];
      return write.apply(this, args);
    };
    res.end = function (...args) {
      respData += args[0];
      return end.apply(this, args);
    };

    OAuthTest.middleware(req, res);
    const credentialSecret = respData;

    // Test that the result for the token is available
    let result = OAuth._retrievePendingCredential(credentialToken,
                                                  credentialSecret);
    const serviceData = OAuth.openSecrets(result.serviceData);
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

Tinytest.add("oauth2 - pendingCredential is stored and can be retrieved (without oauth encryption)", test => {
  OAuthEncryption.loadKey(null);
  testPendingCredential(test);
});

Tinytest.add("oauth2 - pendingCredential is stored and can be retrieved (with oauth encryption)", test => {
  try {
    OAuthEncryption.loadKey(Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]).toString("base64"));
    testPendingCredential(test);
  } finally {
    OAuthEncryption.loadKey(null);
  }
});
