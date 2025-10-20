// Tests for OAuth error reporting functionality

Tinytest.addAsync("oauth - pendingCredential handles Errors",
  async test => {
    const credentialToken = Random.id();

    const testError = new Error("This is a test error");
    testError.stack = 'test stack';
    await OAuth._storePendingCredential(credentialToken, testError);

    // Test that the result for the token is the expected error
    const result = await OAuth._retrievePendingCredential(credentialToken);
    test.instanceOf(result, Error);
    test.equal(result.message, testError.message);
    test.equal(result.stack, testError.stack);
  });

Tinytest.addAsync("oauth - pendingCredential handles Meteor.Errors",
  async test => {
    const credentialToken = Random.id();

    const testError = new Meteor.Error(401, "This is a test error");
    testError.stack = 'test stack';
    await OAuth._storePendingCredential(credentialToken, testError);

    // Test that the result for the token is the expected error
    const result = await OAuth._retrievePendingCredential(credentialToken);
    test.instanceOf(result, Meteor.Error);
    test.equal(result.error, testError.error);
    test.equal(result.message, testError.message);
    test.equal(result.reason, testError.reason);
    test.equal(result.stack, testError.stack);
    test.isUndefined(result.meteorError);
  });

Tinytest.addAsync("oauth - null, undefined key for pendingCredential",
  async test => {
    const cred = Random.id();
    await test.throwsAsync(() => OAuth._storePendingCredential(null, cred));
    await test.throwsAsync(() => OAuth._storePendingCredential(undefined, cred));
  });

Tinytest.addAsync("oauth - pendingCredential handles duplicate key",
  async test => {
    const key = Random.id();
    const cred = Random.id();
    await OAuth._storePendingCredential(key, cred);
    const newCred = Random.id();
    await OAuth._storePendingCredential(key, newCred);
    test.equal(await OAuth._retrievePendingCredential(key), newCred);
  });

Tinytest.addAsync("oauth - pendingCredential requires credential secret",
  async test => {
    const key = Random.id();
    const cred = Random.id();
    const secret = Random.id();
    await OAuth._storePendingCredential(key, cred, secret);
    test.equal(await OAuth._retrievePendingCredential(key), undefined);
    test.equal(await OAuth._retrievePendingCredential(key, secret), cred);
  });

Tinytest.addAsync("oauth - _endOfLoginResponse with popup loginStyle supports unspecified ROOT_URL_PATH_PREFIX",
  async test => {
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
    await OAuth._endOfLoginResponse(res, details);
  }
);

Tinytest.addAsync("oauth - _endOfLoginResponse with popup loginStyle supports ROOT_URL_PATH_PREFIX",
  async test => {
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
    await OAuth._endOfLoginResponse(res, details);
  }
);

Tinytest.addAsync("oauth - _endOfLoginResponse with redirect loginStyle supports unspecified ROOT_URL_PATH_PREFIX",
  async test => {
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
    await OAuth._endOfLoginResponse(res, details);
  }
);

Tinytest.addAsync("oauth - _endOfLoginResponse with redirect loginStyle supports ROOT_URL_PATH_PREFIX",
  async test => {
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
    await OAuth._endOfLoginResponse(res, details);
  }
);

// Tests for OAuth error reporting functionality
if (Meteor.isServer) {
  Tinytest.addAsync("oauth - _endOfLoginResponse includes error information",
    async test => {
      const res = {
        writeHead: () => {},
        end: content => {
          test.matches(content, /"error":"access_denied"/);
          test.matches(content, /"error_description":"User denied access"/);
        }
      };
      const details = {
        credentials: {},
        loginStyle: 'popup',
        error: 'access_denied',
        error_description: 'User denied access'
      };
      await OAuth._endOfLoginResponse(res, details);
    }
  );
}

// Client-side tests
if (Meteor.isClient) {
  Tinytest.add("oauth - OAuth.getError returns null when no errors",
    test => {
      // Clear any existing errors
      const errorKey = OAuth._storageTokenPrefix + "error";
      const errorDescriptionKey = OAuth._storageTokenPrefix + "error_description";
      Meteor._localStorage.removeItem(errorKey);
      Meteor._localStorage.removeItem(errorDescriptionKey);
      
      const result = OAuth.getError();
      test.equal(result, null);
    }
  );

  Tinytest.add("oauth - OAuth.getError retrieves and clears error information",
    test => {
      const errorKey = OAuth._storageTokenPrefix + "error";
      const errorDescriptionKey = OAuth._storageTokenPrefix + "error_description";
      
      // Set up test error data
      Meteor._localStorage.setItem(errorKey, "access_denied");
      Meteor._localStorage.setItem(errorDescriptionKey, "User denied access");
      
      const result = OAuth.getError();
      test.equal(result.error, "access_denied");
      test.equal(result.error_description, "User denied access");
      
      // Verify errors are cleared after retrieval
      const resultAfter = OAuth.getError();
      test.equal(resultAfter, null);
    }
  );

  Tinytest.add("oauth - OAuth.getError handles error without description",
    test => {
      const errorKey = OAuth._storageTokenPrefix + "error";
      const errorDescriptionKey = OAuth._storageTokenPrefix + "error_description";
      
      // Clear any previous data
      Meteor._localStorage.removeItem(errorKey);
      Meteor._localStorage.removeItem(errorDescriptionKey);
      
      // Set up test with only error
      Meteor._localStorage.setItem(errorKey, "invalid_request");
      
      const result = OAuth.getError();
      test.equal(result.error, "invalid_request");
      test.isUndefined(result.error_description);
    }
  );
}
