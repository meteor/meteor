This file is just the same as `coffeescript_tests.coffee`, first we set a 
property, which we check for in `coffeescript_tests.js`, and then a trivial
testcase.

    Meteor.__COFFEEMDSCRIPT_PRESENT = true
    Tinytest.add "markdown coffeescript - compile", (test) -> test.isTrue true
