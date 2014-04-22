Tinytest.add("oauth - pendingCredential handles Errors", function (test) {
  var credentialToken = Random.id();

  var testError = new Error("This is a test error");
  testError.stack = 'test stack';
  OAuth._storePendingCredential(credentialToken, testError);

  // Test that the result for the token is the expected error
  var result = OAuth._retrievePendingCredential(credentialToken);
  test.instanceOf(result, Error);
  test.equal(result.message, testError.message);
  test.equal(result.stack, testError.stack);
});

Tinytest.add("oauth - pendingCredential handles Meteor.Errors", function (test) {
  var credentialToken = Random.id();

  var testError = new Meteor.Error(401, "This is a test error");
  testError.stack = 'test stack';
  OAuth._storePendingCredential(credentialToken, testError);

  // Test that the result for the token is the expected error
  var result = OAuth._retrievePendingCredential(credentialToken);
  test.instanceOf(result, Meteor.Error);
  test.equal(result.error, testError.error);
  test.equal(result.message, testError.message);
  test.equal(result.reason, testError.reason);
  test.equal(result.stack, testError.stack);
  test.isUndefined(result.meteorError);
});
