Tinytest.add("localStorage", function (test) {
  // Doesn't actually test preservation across reloads since that is hard.
  // userData should do that for us so it's unlikely this wouldn't work.
  Meteor._localStorage.setItem("key", "value");
  test.equal(Meteor._localStorage.getItem("key"), "value");
  Meteor._localStorage.removeItem("key");
  test.equal(Meteor._localStorage.getItem("key"), null);
});
