Tinytest.add("oauth - pendingCredential handles Errors", test => {
  const credentialToken = Random.id();

  const testError = new Error("This is a test error");
  testError.stack = 'test stack';
  OAuth._storePendingCredential(credentialToken, testError);

  // Test that the result for the token is the expected error
  const result = OAuth._retrievePendingCredential(credentialToken);
  test.instanceOf(result, Error);
  test.equal(result.message, testError.message);
  test.equal(result.stack, testError.stack);
});

Tinytest.add("oauth - pendingCredential handles Meteor.Errors", test => {
  const credentialToken = Random.id();

  const testError = new Meteor.Error(401, "This is a test error");
  testError.stack = 'test stack';
  OAuth._storePendingCredential(credentialToken, testError);

  // Test that the result for the token is the expected error
  const result = OAuth._retrievePendingCredential(credentialToken);
  test.instanceOf(result, Meteor.Error);
  test.equal(result.error, testError.error);
  test.equal(result.message, testError.message);
  test.equal(result.reason, testError.reason);
  test.equal(result.stack, testError.stack);
  test.isUndefined(result.meteorError);
});

Tinytest.add("oauth - null, undefined key for pendingCredential", test => {
  const cred = Random.id();
  test.throws(() => OAuth._storePendingCredential(null, cred));
  test.throws(() => OAuth._storePendingCredential(undefined, cred));
});

Tinytest.add("oauth - pendingCredential handles duplicate key", test => {
  const key = Random.id();
  const cred = Random.id();
  OAuth._storePendingCredential(key, cred);
  const newCred = Random.id();
  OAuth._storePendingCredential(key, newCred);
  test.equal(OAuth._retrievePendingCredential(key), newCred);
});

Tinytest.add("oauth - pendingCredential requires credential secret", test => {
  const key = Random.id();
  const cred = Random.id();
  const secret = Random.id();
  OAuth._storePendingCredential(key, cred, secret);
  test.equal(OAuth._retrievePendingCredential(key), undefined);
  test.equal(OAuth._retrievePendingCredential(key, secret), cred);
});

Tinytest.add("oauth - _endOfLoginResponse with popup loginStyle supports unspecified ROOT_URL_PATH_PREFIX",
  test => {
    const res = {
      writeHead: () => {},
      end: content => {
        test.matches(
          content,
          /\/packages\/oauth\/end_of_popup_response\.js/
        );
      }
    };
    const details = {
      credentials: {},
      loginStyle: 'popup'
    };
    OAuth._endOfLoginResponse(res, details);
  }
);

Tinytest.add("oauth - _endOfLoginResponse with popup loginStyle supports ROOT_URL_PATH_PREFIX",
  test => {
    const rootUrlPathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;
    __meteor_runtime_config__.ROOT_URL_PATH_PREFIX = '/test-root-url-prefix';
    const res = {
      writeHead: () => {},
      end: content => {
        __meteor_runtime_config__.ROOT_URL_PATH_PREFIX = rootUrlPathPrefix;
        test.matches(
          content,
          /\/test-root-url-prefix\/packages\/oauth\/end_of_popup_response\.js/
        );
      }
    };
    const details = {
      credentials: {},
      loginStyle: 'popup'
    };
    OAuth._endOfLoginResponse(res, details);
  }
);

Tinytest.add("oauth - _endOfLoginResponse with redirect loginStyle supports unspecified ROOT_URL_PATH_PREFIX",
  test => {
    const res = {
      writeHead: () => {},
      end: content => {
        test.matches(
          content,
          /\/packages\/oauth\/end_of_redirect_response\.js/
        );
      }
    };
    const details = {
      credentials: {},
      loginStyle: 'redirect',
      query: {
        state: Buffer.from(JSON.stringify({
          redirectUrl: __meteor_runtime_config__.ROOT_URL
        }), 'binary').toString('base64')
      }
    };
    OAuth._endOfLoginResponse(res, details);
  }
);


Tinytest.add("oauth - _endOfLoginResponse with redirect loginStyle supports ROOT_URL_PATH_PREFIX",
  test => {
    const rootUrlPathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;
    __meteor_runtime_config__.ROOT_URL_PATH_PREFIX = '/test-root-url-prefix';
    const res = {
      writeHead: () => {},
      end: content => {
        __meteor_runtime_config__.ROOT_URL_PATH_PREFIX = rootUrlPathPrefix;
        test.matches(
          content,
          /\/test-root-url-prefix\/packages\/oauth\/end_of_redirect_response\.js/
        );
      }
    };
    const details = {
      credentials: {},
      loginStyle: 'redirect',
      query: {
        state: Buffer.from(JSON.stringify({
          redirectUrl: __meteor_runtime_config__.ROOT_URL
        }), 'binary').toString('base64')
      }
    };
    OAuth._endOfLoginResponse(res, details);
  }
);
