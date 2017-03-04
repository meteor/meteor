var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("dynamic import(...) in development", function () {
  const s = new Sandbox();
  s.createApp("dynamic-import-test-app-devel", "dynamic-import");
  s.cd("dynamic-import-test-app-devel", run.bind(s, false));
});

selftest.define("dynamic import(...) in production", function () {
  const s = new Sandbox();
  s.createApp("dynamic-import-test-app-prod", "dynamic-import");
  s.cd("dynamic-import-test-app-prod", run.bind(s, true));
});

function run(prod) {
  const sandbox = this;
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
