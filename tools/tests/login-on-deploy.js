var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var testUtils = require('../tool-testing/test-utils.js');

var commandTimeoutSecs = 10;

// Split out from login.js so it gets its own GHA matrix job — this is the
// only network-bound deploy test in the suite and was previously dragging
// the entire login.js job to ~16 min worst-case.
//
// This is a Galaxy-related command (deploy), but still pretty auth-y.
selftest.define("login on deploy", ['net'], async function () {
  const s = new Sandbox;
  await s.init();

  const appName = testUtils.randomAppName();

  await s.createApp(appName, "standard-app");
  s.cd(appName);

  let run = s.run("deploy", appName);
  await run.matchErr(/You must be logged in to deploy/);

  await run.matchErr("Email:");
  run.write("test@test.com\n");

  await run.matchErr("Logging in as test.");

  await run.matchErr("Password:");
  run.write("SoVeryWrong\n");
  run.waitSecs(commandTimeoutSecs);
  await run.matchErr("Login failed");

  await run.matchErr("Password:");
  run.write("testtest\n");
  run.waitSecs(commandTimeoutSecs * 3);
  // Once this line appears the auth flow has succeeded and the CLI is
  // dialing Galaxy to start the deploy. The test's purpose ("login on
  // deploy") is fulfilled at this point. Continuing on would bundle the
  // app, upload it, and wait for Galaxy to reject the unauthorized push
  // — a round-trip that has historically blown out to many minutes
  // when CI bandwidth or Galaxy responsiveness is degraded, and which
  // doesn't add coverage of the login surface this test is named for.
  await run.match("Talking to Galaxy servers");
  await run.stop();
});
