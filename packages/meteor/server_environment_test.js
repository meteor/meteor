Tinytest.add("environment - server basics", function (test) {
  test.isFalse(Meteor.isClient);
  test.isTrue(Meteor.isServer);
  test.isFalse(Meteor.isCordova);
});
