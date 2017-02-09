var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("dynamic import(...)", function () {
  const s = new Sandbox();
  s.createApp("dynamic-import-test-app", "dynamic-import");
  s.cd("dynamic-import-test-app", function () {
    run(s, false);
    run(s, true);
  });
});

function run(sandbox, prod) {
  const args = [
    "test",
    "--once",
    "--full-app",
    "--driver-package", "dispatch:mocha-phantomjs"
  ];

  if (prod) {
    args.push("--production");
  }

  const run = sandbox.run(...args);

  run.waitSecs(60);
  run.match("App running at");
  run.match("SERVER FAILURES: 0");
  run.match("CLIENT FAILURES: 0");
  run.expectExit(0);
}
