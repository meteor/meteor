Tinytest.addAsync("meteor-promise - sanity", function (test, done) {
  var expectedError = new Error("expected");
  Promise.resolve("working").then(function (result) {
    test.equal(result, "working");
    throw expectedError;
  }).catch(function (error) {
    test.equal(error, expectedError);
    if (Meteor.isServer) {
      var Fiber = require("fibers");
      // Make sure the Promise polyfill runs callbacks in a Fiber.
      test.instanceOf(Fiber.current, Fiber);
    }
  }).then(done, function (error) {
    test.exception(error);
  });
});

Tinytest.addAsync("meteor-promise - finally", function (test, done) {
  var finallyCalledAfterResolved = false;
  Promise.resolve("working").then(function (result) {
    test.equal(result, "working");
  }).finally(function () {
    finallyCalledAfterResolved = true;
  }).then(function () {
    test.isTrue(finallyCalledAfterResolved);
    done();
  });

  var finallyCalledAfterRejected = false;
  Promise.reject("failed").catch(function (result) {
    test.equal(result, "failed");
  }).finally(function () {
    finallyCalledAfterRejected = true;
  }).then(function () {
    test.isTrue(finallyCalledAfterRejected);
    done();
  });
});
