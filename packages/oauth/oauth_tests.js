Tinytest.add("oauth - transientResult handles errors", function (test) {
  var credentialToken = Random.id();

  var testError = new Error("This is a test error");
  testError.stack = 'test stack';
  Oauth._storeTransientResult(credentialToken, testError);

  // Test that the result for the token is the expected error
  var result = Oauth._retrieveTransientResult(credentialToken);
  test.instanceOf(result, Error);
  test.equal(result.message, testError.message);
  test.equal(result.stack, testError.stack);
});
