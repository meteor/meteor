Tinytest.addAsync("meteor-promise - sanity", function (test, done) {
  var expectedError = new Error("expected");
  Promise.resolve("working").then(function (result) {
    test.equal(result, "working");
    throw expectedError;
  }).catch(function (error) {
    test.equal(error, expectedError);
    if (Meteor.isServer) {
      var Fiber = Npm.require("fibers");
      // Make sure the Promise polyfill runs callbacks in a Fiber.
      test.instanceOf(Fiber.current, Fiber);
    }
  }).then(done, function (error) {
    test.exception(error);
  });
});
