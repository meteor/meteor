import http from 'node:http';
import { OAuth1Binding } from './oauth1_binding';

const testPendingCredential = async (test, method) => {
  const twitterfooId = Random.id();
  const twitterfooName = `nickname${Random.id()}`;
  const twitterfooAccessToken = Random.id();
  const twitterfooAccessTokenSecret = Random.id();
  const twitterOption1 = Random.id();
  const credentialToken = Random.id();
  const serviceName = Random.id();

  const urls = {
    requestToken: "https://example.com/oauth/request_token",
    authorize: "https://example.com/oauth/authorize",
    accessToken: "https://example.com/oauth/access_token",
    authenticate: "https://example.com/oauth/authenticate"
  };

  OAuth1Binding.prototype.prepareRequestToken = async () => {};
  OAuth1Binding.prototype.prepareAccessToken = async function() {
    this.accessToken = twitterfooAccessToken;
    this.accessTokenSecret = twitterfooAccessTokenSecret;
  };

  await ServiceConfiguration.configurations.insertAsync({service: serviceName});

  try {
    // register a fake login service
    OAuth.registerService(serviceName, 1, urls, async () => ({
      serviceData: {
        id: twitterfooId,
        screenName: twitterfooName,
        accessToken: OAuth.sealSecret(twitterfooAccessToken),
        accessTokenSecret: OAuth.sealSecret(twitterfooAccessTokenSecret)
      },
      options: {
        option1: twitterOption1
      }
    }));

    // simulate logging in using twitterfoo
    await OAuth._storeRequestToken(credentialToken, twitterfooAccessToken);

    const req = {
      method,
      url: `/_oauth/${serviceName}`
    };

    const payload = {
      state: OAuth._generateState('popup', credentialToken),
      oauth_token: twitterfooAccessToken,
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
    res.write = function (...args) {
      respData += args[0];
      return write.apply(this, args);
    };
    res.end = function (...args) {
      respData += args[0];
      return end.apply(this, arguments);
    };
    await OAuthTest.middleware(req, res);
    const credentialSecret = respData;
    // Test that the result for the token is available
    let result = await OAuth._retrievePendingCredential(credentialToken,
                                                  credentialSecret);
    const serviceData = OAuth.openSecrets(result.serviceData);
    test.equal(result.serviceName, serviceName);
    test.equal(serviceData.id, twitterfooId);
    test.equal(serviceData.screenName, twitterfooName);
    test.equal(serviceData.accessToken, twitterfooAccessToken);
    test.equal(serviceData.accessTokenSecret, twitterfooAccessTokenSecret);
    test.equal(result.options.option1, twitterOption1);

    // Test that pending credential is removed after being retrieved
    result = await OAuth._retrievePendingCredential(credentialToken);
    test.isUndefined(result);

  } finally {
    OAuthTest.unregisterService(serviceName);
  }
};

Tinytest.addAsync("oauth1 - pendingCredential is stored and can be retrieved (without oauth encryption)", async test => {
  OAuthEncryption.loadKey(null);
  await testPendingCredential(test, "GET");
  await testPendingCredential(test, "POST");
});

Tinytest.addAsync("oauth1 - pendingCredential is stored and can be retrieved (with oauth encryption)", async test => {
  try {
    OAuthEncryption.loadKey(Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]).toString("base64"));
    await testPendingCredential(test, "GET");
    await testPendingCredential(test, "POST");
  } finally {
    OAuthEncryption.loadKey(null);
  }
});

Tinytest.addAsync("oauth1 - duplicate key for request token", async test => {
  const key = Random.id();
  const token = Random.id();
  const secret = Random.id();
  await OAuth._storeRequestToken(key, token, secret);
  const newToken = Random.id();
  const newSecret = Random.id();
  await OAuth._storeRequestToken(key, newToken, newSecret);
  const result = await  OAuth._retrieveRequestToken(key);
  test.equal(result.requestToken, newToken);
  test.equal(result.requestTokenSecret, newSecret);
});

Tinytest.addAsync("oauth1 - null, undefined key for request token", async test => {
  const token = Random.id();
  const secret = Random.id();
  await test.throwsAsync(() => OAuth._storeRequestToken(null, token, secret));
  await test.throwsAsync(() => OAuth._storeRequestToken(undefined, token, secret));
});

Tinytest.add("oauth1 - signature is built correctly", test => {
  const binding = new OAuth1Binding({ secret: "42" });
  const method = "GET";
  const url = "www.meteor.com";
  const rawHeaders = {
    normal: "normal",
    withSpaces: "with spaces",
    specialCharacters: "`!@#$%^&*()",
  };
  const accessTokenSecret = "SECRET_1234_!@#$";
  const params = {
    param2: 2,
    param3: 3,
    param1: 1,
  };

  test.equal(
    binding._getSignature(method, url, rawHeaders, accessTokenSecret, params),
    "fvQmrhLJqZgEAiwCKSlWHKYWqPk="
  );
});

Tinytest.add("oauth1 - headers are encoded correctly", test => {
  const binding = new OAuth1Binding();
  const headers = {
    normal: "normal",
    withSpaces: "with spaces",
    specialCharacters: "`!@#$%^&*()",
  };

  test.equal(
    binding._encodeHeader(headers),
    {
      normal: "normal",
      withSpaces: "with%20spaces",
      specialCharacters: "%60%21%40%23%24%25%5E%26%2A%28%29",
    }
  );
});

Tinytest.add("oauth1 - auth header string is built correctly", test => {
  const binding = new OAuth1Binding();
  const headers = {
    normal: "normal",
    withSpaces: "with spaces",
    specialCharacters: "`!@#$%^&*()",
  };

  test.equal(
    binding._getAuthHeaderString(headers),
    "OAuth " +
    'normal="normal", ' +
    'specialCharacters="%60%21%40%23%24%25%5E%26%2A%28%29", ' +
    'withSpaces="with%20spaces"'
  );
});
