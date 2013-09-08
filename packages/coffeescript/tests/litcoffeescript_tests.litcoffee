This file is just the same as `coffeescript_tests.coffee`, first we set a 
property, which we check for in `coffeescript_tests.js`, and then a trivial
testcase.

    Meteor.__LITCOFFEESCRIPT_PRESENT = true
    Tinytest.add "literate coffeescript - compile", (test) -> test.isTrue true
