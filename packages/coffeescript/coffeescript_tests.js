Tinytest.add("coffeescript - presence", function(test) {
  test.isTrue(Meteor.__COFFEESCRIPT_PRESENT);
});
Tinytest.add("literate coffeescript - presence", function(test) {
  test.isTrue(Meteor.__LITCOFFEESCRIPT_PRESENT);
  test.isTrue(Meteor.__COFFEEMDSCRIPT_PRESENT);
});

Tinytest.add("coffeescript - exported variable", function(test) {
  test.equal(COFFEESCRIPT_EXPORTED, 123);
  test.equal(Package['coffeescript-test-helper'].COFFEESCRIPT_EXPORTED, 123);
});