Meteor.__COFFEESCRIPT_PRESENT = true

# This is read in coffeescript_strict_tests.coffee.
share.coffeeShared = 789

Tinytest.add "coffeescript - compile", (test) -> test.isTrue true


# import/export statements must be top-level
`import { Meteor as testingForImportedSymbol123456789 } from "meteor/meteor";`
Tinytest.add "coffeescript - import external package via backticks", (test) ->
  test.isTrue testingForImportedSymbol123456789?

`import { testingForImportedModule987654321 } from "./es2015_module.js";`
Tinytest.add "coffeescript - import local module via backticks", (test) ->
  test.isTrue testingForImportedModule987654321?
