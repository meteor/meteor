var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("typescript template works", function () {
  const s = new Sandbox;

  let run = s.run("create", "--typescript", "typescript");

  run.waitSecs(60);
  run.match("Created a new Meteor app in 'typescript'.");
  run.match("To run your new app");

  s.cd("typescript");

  run = s.run("npm", "install");
  run.expectExit(0);

  run = s.run("lint");
  run.waitSecs(60);
  run.match("[zodern:types] Exiting \"meteor lint\" early");
  run.expectExit(0);

  run = s.run("npx", "tsc");
  run.waitSecs(60);
  run.expectEnd();
  run.expectExit(0);
});
