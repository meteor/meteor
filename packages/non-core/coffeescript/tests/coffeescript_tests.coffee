Meteor.__COFFEESCRIPT_PRESENT = true

# This is read in coffeescript_strict_tests.coffee.
share.coffeeShared = 789

Tinytest.add "coffeescript - compile", (test) -> test.isTrue true


# import/export statements must be top-level
`import { Meteor as testingForBacktickedImportedSymbol } from "meteor/meteor";`
Tinytest.add "coffeescript - import external package via backticked import statement", (test) ->
  test.isTrue testingForBacktickedImportedSymbol?

`import { testingForImportedModule987654321 } from "./es2015_module.js";`
Tinytest.add "coffeescript - import local module via backticked import statement", (test) ->
  test.isTrue testingForImportedModule987654321?


import { Meteor as testingForNativeImportedSymbol } from "meteor/meteor"
Tinytest.add "coffeescript - import external package via native import statement", (test) ->
  test.isTrue testingForNativeImportedSymbol?

import { testingForImportedModule123456789 } from "./es2015_module.js";
Tinytest.add "coffeescript - import local module via native import statement", (test) ->
  test.isTrue testingForImportedModule123456789?


import { testingForNativeImportedModule123456789 } from "./coffeescript_module.coffee";
Tinytest.add "coffeescript - import local module exported by a CoffeeScript native export statement, via native import statement", (test) ->
  test.isTrue testingForNativeImportedModule123456789?
