Meteor.__COFFEESCRIPT_PRESENT = true

# This is read in coffeescript_strict_tests.coffee.
share.coffeeShared = 789

Tinytest.add "coffeescript - compile", (test) -> test.isTrue true
