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

Tinytest.add("oauth - null, undefined key for pendingCredential", function (test) {
  var cred = Random.id();
  test.throws(function () {
    OAuth._storePendingCredential(null, cred);
  });
  test.throws(function () {
    OAuth._storePendingCredential(undefined, cred);
  });
});

Tinytest.add("oauth - pendingCredential handles duplicate key", function (test) {
  var key = Random.id();
  var cred = Random.id();
  OAuth._storePendingCredential(key, cred);
  var newCred = Random.id();
  OAuth._storePendingCredential(key, newCred);
  test.equal(OAuth._retrievePendingCredential(key), newCred);
});

Tinytest.add(
  "oauth - pendingCredential requires credential secret",
  function (test) {
    var key = Random.id();
    var cred = Random.id();
    var secret = Random.id();
    OAuth._storePendingCredential(key, cred, secret);
    test.equal(OAuth._retrievePendingCredential(key), undefined);
    test.equal(OAuth._retrievePendingCredential(key, secret), cred);
  }
);
