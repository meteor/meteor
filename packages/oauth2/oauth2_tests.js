import http from 'http';

const testPendingCredential = async function (test, method) {
  const foobookId = Random.id();
  const foobookOption1 = Random.id();
  const credentialToken = Random.id();
  const serviceName = Random.id();

  await ServiceConfiguration.configurations.insertAsync({service: serviceName});

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
    const req = {
      method,
      url: `/_oauth/${serviceName}`
    };

    const payload = {
      state: OAuth._generateState('popup', credentialToken),
      close: 1,
      only_credential_secret_for_test: 1
    };

    if (method === 'GET') {
      req.query = payload;
    } else {
      req.body = payload;
    }

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

    await OAuthTest.middleware(req, res);
    const credentialSecret = respData;

    // Test that the result for the token is available
    let result = await OAuth._retrievePendingCredential(credentialToken,
                                                  credentialSecret);
    const serviceData = OAuth.openSecrets(result.serviceData);
    test.equal(result.serviceName, serviceName);
    test.equal(serviceData.id, foobookId);
    test.equal(serviceData.secretStuff, 'confidential');
    test.equal(result.options.option1, foobookOption1);

    // Test that pending credential is removed after being retrieved
    result = await OAuth._retrievePendingCredential(credentialToken);
    test.isUndefined(result);

  } finally {
    OAuthTest.unregisterService(serviceName);
  }
};

Tinytest.addAsync("oauth2 - pendingCredential is stored and can be retrieved (without oauth encryption)", async test => {
  OAuthEncryption.loadKey(null);
  await testPendingCredential(test, "GET");
  await testPendingCredential(test, "POST");
});

Tinytest.addAsync("oauth2 - pendingCredential is stored and can be retrieved (with oauth encryption)", async test => {
  try {
    OAuthEncryption.loadKey(Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]).toString("base64"));
    await testPendingCredential(test, "GET");
    await testPendingCredential(test, "POST");
  } finally {
    OAuthEncryption.loadKey(null);
  }
});
