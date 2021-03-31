'use strict'

# Another variable, which will stay in the var line.
x = 5

# This adds a utility function to the var line.
y = []
x in y

Tinytest.add "coffeescript - shared", (test) ->
  test.equal share.coffeeShared, 789
  test.equal sharedFromJavaScript, 135
