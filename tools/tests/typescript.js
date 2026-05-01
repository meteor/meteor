var assert = require('assert');
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

  // Surface the actual failure mode if devDeps weren't installed during
  // `meteor create`. Without this, an uninstalled `typescript` devDep
  // would only manifest later when `npx tsc` falls back to fetching the
  // joke package `tsc@2.0.4` from the registry — confusing and far from
  // the root cause.
  assert(
    s.read("node_modules/typescript/package.json"),
    "typescript devDependency was not installed by `meteor create --typescript`",
  );

  run = s.run("npm", "install");
  await run.expectExit(0);

  run = s.run("lint");
  run.waitSecs(60);
  await run.match('[zodern:types] Exiting "meteor lint" early');
  await run.expectExit(0);

  run = s.run("npx", "tsc");
  run.waitSecs(60);
  await run.expectEnd();
  await run.expectExit(0);
});
