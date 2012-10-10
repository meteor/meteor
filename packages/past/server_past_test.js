Tinytest.add("past - server", function (test) {
  test.isFalse(Meteor.is_client);
  test.isTrue(Meteor.is_server);
});
