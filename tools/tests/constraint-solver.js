var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

// Runs all of the constraint-solver tests, including ones that tie up the CPU
// for too long to safely run in the normal test-packages run.
// Only run from checkouts, because test-packages only works on local packages.
selftest.define('constraint solver benchmark', ['checkout'], async function () {
  var s = new Sandbox();
  await s.init();

  s.set('CONSTRAINT_SOLVER_BENCHMARK', 't');
  var run = s.run("test-packages",
                  "--driver-package=test-server-tests-in-console-once",
                  "--once",
                  "constraint-solver");

  run.waitSecs(60*4);
  await run.match("ALL TESTS PASSED");
  await run.expectExit(0);
});
