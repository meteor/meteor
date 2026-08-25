var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("typescript template works", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "--typescript", "typescript");

  run.waitSecs(60);
  await run.match("Created a new Meteor app in 'typescript'.");
  await run.match("To run your new app");

  s.cd("typescript");

  run = s.run("npm", "install");
  await run.expectExit(0);

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Generated package type declarations.");
  await run.expectExit(0);

  run = s.run("npm", "exec", "--", "tsc");
  run.waitSecs(60);
  await run.expectEnd();
  await run.expectExit(0);
});
