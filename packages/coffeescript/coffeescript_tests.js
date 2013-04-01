Tinytest.add("coffeescript - presence", function(test) {
  test.isTrue(Meteor.__COFFEESCRIPT_PRESENT);
});
Tinytest.add("literate coffeescript - presence", function(test) {
  test.isTrue(Meteor.__LITCOFFEESCRIPT_PRESENT);
});
Tinytest.add("coffeescript - set global variable", function(test) {
  test.equal(__COFFEESCRIPT_TEST_GLOBAL, 123);
});

