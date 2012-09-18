Tinytest.add("environment - client basics", function (test) {
  test.isTrue(Meteor.isClient);
  test.isFalse(Meteor.isServer);
});
