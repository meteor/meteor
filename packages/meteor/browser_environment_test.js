Tinytest.add("environment - browser basics", function (test) {
  test.isTrue(Meteor.isClient);
  test.isFalse(Meteor.isServer);
  test.isFalse(Meteor.isCordova);
});
