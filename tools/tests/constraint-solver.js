var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files.js');
var _= require('underscore');

// Runs all of the constraint-solver tests, including ones that tie up the CPU
// for too long to safely run in the normal test-packages run.
// Only run from checkouts, because test-packages only works on local packages.
selftest.define('constraint solver benchmark', ['checkout'], function () {
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
