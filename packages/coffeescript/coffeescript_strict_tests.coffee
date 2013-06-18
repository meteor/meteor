'use strict'

@__COFFEESCRIPT_TEST_GLOBAL2 = 456

Tinytest.add "coffeescript - shared", (test) ->
  test.equal share.coffeeShared, 789
  test.equal sharedFromJavascript, 135
