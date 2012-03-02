Tinytest.add("environment - client basics", function (test) {
  test.isTrue(Meteor.is_client);
  test.isFalse(Meteor.is_server);
});
