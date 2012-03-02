Tinytest.add("logging", function (test) {

  // Just run a log statement and make sure it doesn't explode.
  Meteor._debug();
  Meteor._debug("test one arg");
  Meteor._debug("this", "is", "a", "test");
  test.ok();

});
