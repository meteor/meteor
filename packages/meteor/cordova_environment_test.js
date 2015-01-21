Tinytest.add("environment - cordova basics", function (test) {
  test.isFalse(Meteor.isServer);
  test.isTrue(Meteor.isClient);
  test.isTrue(Meteor.isCordova);
});

