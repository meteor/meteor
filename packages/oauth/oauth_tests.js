// Server-only tests - these functions are only available on the server
if (Meteor.isServer) {
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
}

// Server-only tests for _endOfLoginResponse - these functions are only available on the server
if (Meteor.isServer) {
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
}


if (Meteor.isClient) {
  Tinytest.add("oauth - OAuth.getError returns null when no error",
    test => {
      const keys = {
        error: OAuth._storageTokenPrefix + "error",
        errorDescription: OAuth._storageTokenPrefix + "error_description"
      };
      Meteor._localStorage.removeItem(keys.error);
      Meteor._localStorage.removeItem(keys.errorDescription);
      
      const result = OAuth.getError();
      test.isNull(result);
    });

  Tinytest.add("oauth - OAuth.getError retrieves and clears error information",
    test => {
      const keys = {
        error: OAuth._storageTokenPrefix + "error",
        errorDescription: OAuth._storageTokenPrefix + "error_description"
      };
      
      Meteor._localStorage.setItem(keys.error, "access_denied");
      Meteor._localStorage.setItem(keys.errorDescription, "User is not assigned to the client application");
      
      const result = OAuth.getError();
      test.isNotNull(result);
      test.equal(result.error, "access_denied");
      test.equal(result.error_description, "User is not assigned to the client application");
      
      const resultAfterClear = OAuth.getError();
      test.isNull(resultAfterClear);
    });

  Tinytest.add("oauth - OAuth.getError basic test",
    test => {
      // This test should just pass if OAuth.getError() returns null initially
      const result = OAuth.getError();
      test.isNull(result);
    });

  Tinytest.add("oauth - OAuth.getError handles error with description",
    test => {
      const keys = {
        error: OAuth._storageTokenPrefix + "error",
        errorDescription: OAuth._storageTokenPrefix + "error_description"
      };
      
      // Clear any existing error data
      Meteor._localStorage.removeItem(keys.error);
      Meteor._localStorage.removeItem(keys.errorDescription);
      
      // Set an error with description
      Meteor._localStorage.setItem(keys.error, "access_denied");
      Meteor._localStorage.setItem(keys.errorDescription, "User is not assigned to the client application");
      
      const result = OAuth.getError();
      test.isNotNull(result);
      test.equal(result.error, "access_denied");
      test.equal(result.error_description, "User is not assigned to the client application");
      
      // Verify the error is cleared after retrieval
      const resultAfterClear = OAuth.getError();
      test.isNull(resultAfterClear);
    });

  Tinytest.add("oauth - Post-login consistency test: consecutive login attempts",
    test => {
      const keys = {
        error: OAuth._storageTokenPrefix + "error",
        errorDescription: OAuth._storageTokenPrefix + "error_description"
      };
      
      // Ensure clean initial state
      Meteor._localStorage.removeItem(keys.error);
      Meteor._localStorage.removeItem(keys.errorDescription);
      
      // Verify initial clean state
      const initialResult = OAuth.getError();
      test.isNull(initialResult);
      
      // Simulate first login attempt failure
      Meteor._localStorage.setItem(keys.error, "access_denied");
      Meteor._localStorage.setItem(keys.errorDescription, "User denied access");
      
      // Retrieve and verify the first error
      const firstError = OAuth.getError();
      test.isNotNull(firstError);
      test.equal(firstError.error, "access_denied");
      test.equal(firstError.error_description, "User denied access");
      
      // Verify first error is cleared
      const clearedResult = OAuth.getError();
      test.isNull(clearedResult);
      
      // Simulate second login attempt failure with different error
      Meteor._localStorage.setItem(keys.error, "invalid_scope");
      Meteor._localStorage.setItem(keys.errorDescription, "Requested scope is invalid");
      
      // Retrieve and verify the second error
      const secondError = OAuth.getError();
      test.isNotNull(secondError);
      test.equal(secondError.error, "invalid_scope");
      test.equal(secondError.error_description, "Requested scope is invalid");
      
      // Clear second error
      const clearedSecondResult = OAuth.getError();
      test.isNull(clearedSecondResult);
      
      // Simulate successful login (no error stored)
      // Verify that calling OAuth.getError() after successful login returns null
      const successResult = OAuth.getError();
      test.isNull(successResult, "After successful login, OAuth.getError should return null");
      
      // Double-check that no error persists
      const finalResult = OAuth.getError();
      test.isNull(finalResult, "Multiple calls to OAuth.getError after success should return null");
    });

  Tinytest.add("oauth - OAuth.getError handles error without description",
    test => {
      // Ensure clean state
      const errorKey = OAuth._storageTokenPrefix + "error";
      const errorDescKey = OAuth._storageTokenPrefix + "error_description";
      
      Meteor._localStorage.removeItem(errorKey);
      Meteor._localStorage.removeItem(errorDescKey);
      
      // Verify clean state
      const initialResult = OAuth.getError();
      test.isNull(initialResult);
      
      // Set error in localStorage
      Meteor._localStorage.setItem(errorKey, "invalid_request");
      
      // Test OAuth.getError
      const result = OAuth.getError();
      
      // Result should be an object
      if (result === null) {
        test.fail("OAuth.getError() returned null when error was set in localStorage");
        return;
      }
      if (result === undefined) {
        test.fail("OAuth.getError() returned undefined when error was set in localStorage");
        return;
      }
      
      test.equal(result.error, "invalid_request");
      test.isUndefined(result.error_description);
      
      // Verify cleanup
      const afterResult = OAuth.getError();
      test.isNull(afterResult);
    });
}

// Server-only tests for _endOfLoginResponse with error handling
if (Meteor.isServer) {
  Tinytest.addAsync("oauth - _endOfLoginResponse includes error in config for popup",
    async test => {
      let capturedContent;
      const res = {
        writeHead: () => {},
        end: content => { capturedContent = content; }
      };
      const details = {
        error: "access_denied",
        error_description: "User is not assigned to the client application",
        loginStyle: "popup"
      };
      
      await OAuth._endOfLoginResponse(res, details);
      
      test.matches(capturedContent, /access_denied/);
      test.matches(capturedContent, /User is not assigned to the client application/);
    });

  Tinytest.addAsync("oauth - _endOfLoginResponse includes error in config for redirect",
    async test => {
      let capturedContent;
      const res = {
        writeHead: () => {},
        end: content => { capturedContent = content; }
      };
      const details = {
        error: "invalid_scope",
        error_description: "The requested scope is invalid",
        loginStyle: "redirect",
        query: {
          state: Buffer.from(JSON.stringify({
            redirectUrl: __meteor_runtime_config__.ROOT_URL
          }), "binary").toString("base64")
        }
      };
      
      await OAuth._endOfLoginResponse(res, details);
      
      test.matches(capturedContent, /invalid_scope/);
      test.matches(capturedContent, /The requested scope is invalid/);
    });
}
