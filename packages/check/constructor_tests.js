Tinytest.add("constructor - isConstructor", function (test) {
  test.isTrue(Meteor.isConstructor(RegExp));
});
