import { Meteor } from "meteor/meteor"
import { Tinytest } from "meteor/tinytest"


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

import { testingForImportedModule123456789 } from "./es2015_module.js"
Tinytest.add "coffeescript - import local module via native import statement", (test) ->
  test.isTrue testingForImportedModule123456789?


import { testingForNativeImportedModule123456789 } from "./coffeescript_module.coffee"
Tinytest.add "coffeescript - import local module exported by a CoffeeScript native export statement, via native import statement", (test) ->
  test.isTrue testingForNativeImportedModule123456789?


# CoffeeScript 2 is active, with its conforming-to-ES2015 breaking changes
Tinytest.add "coffeescript - ES2015 conformity", (test) ->
  f = (a = 1) -> a
  test.isTrue f(null) is null # `f(null)` would be 1 in CoffeeScript 1.x


Tinytest.add "coffeescript - JSX", (test) ->
  # Mock React
  React =
    createElement: (tag, attributes, body) ->
      "<#{tag}>#{body}</#{tag}>"
  test.isTrue <div>Hello from JSX!</div> is '<div>Hello from JSX!</div>'


if Meteor.isModern
  Tinytest.add "coffeescript - modern browsers", (test) ->
    klass = class Klass
    test.isTrue klass.toString().startsWith 'class'
