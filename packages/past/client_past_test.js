Tinytest.add("past - client", function (test) {
  test.isTrue(Meteor.is_client);
  test.isFalse(Meteor.is_server);
});
