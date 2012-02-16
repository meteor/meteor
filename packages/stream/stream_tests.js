test("stream - status", function () {
  // Very basic test. Just see that it runs and returns something. Not a
  // lot of coverage, but enough that it would have caught a recent bug.
  var status = Meteor.status();
  assert.equal(typeof status, "object");
  assert.isTrue(status.status);
});
