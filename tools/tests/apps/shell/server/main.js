import { Meteor } from 'meteor/meteor';

Meteor.startup(() => {
  Meteor.checkMeFromShell = "oky dok";
});

// Create a global underscore variable which should be preserved,
// not overriden by the special REPL `_` variable, when a command
// is executed on the shell.  The method will allow the test to call
// back and confirm it's still set.
global._ = {_specialUnderscoreTestObject: true };
Meteor.methods({
  "__meteor__/__self_test__/shell-tests/underscore"() {
    return typeof _ === "object" && Object.keys(_);
  }
})
