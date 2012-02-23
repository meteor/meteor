test("environment - server basics", function () {
  assert.isFalse(Meteor.is_client);
  assert.isTrue(Meteor.is_server);
});
