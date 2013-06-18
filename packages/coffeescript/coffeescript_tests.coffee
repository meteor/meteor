Meteor.__COFFEESCRIPT_PRESENT = true

@__COFFEESCRIPT_TEST_GLOBAL = 123

# This is ready in coffeescript_strict_tests.coffee.
share.coffeeShared = 789

Tinytest.add "coffeescript - compile", (test) -> test.isTrue true
