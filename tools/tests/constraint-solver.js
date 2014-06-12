var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../files.js');
var _= require('underscore');

// Add packages to an app. Change the contents of the packages and their
// dependencies, make sure that the app still refreshes.
selftest.define('constraint solver benchmark', ['slow'], function () {
  var s = new Sandbox();
  s.set('CONSTRAINT_SOLVER_BENCHMARK', 't');
  var run = s.run("test-packages",
                  "--driver-package=test-server-tests-in-console-once",
                  "--once",
                  "constraint-solver");

  run.waitSecs(60*4);
  run.match("ALL TESTS PASSED");
  run.expectExit(0);
});
