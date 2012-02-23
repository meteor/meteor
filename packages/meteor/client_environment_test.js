test("environment - client basics", function () {
  assert.isTrue(Meteor.is_client);
  assert.isFalse(Meteor.is_server);
});
