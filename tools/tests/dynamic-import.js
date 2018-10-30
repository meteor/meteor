var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
const { mkdtemp } = require("../fs/files.js");

const offlineStorageQuotaKB = 10000;

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

selftest.define("dynamic import(...) with cache", function () {
  const s = new Sandbox();
  s.createApp("dynamic-import-test-app-cache", "dynamic-import");
  s.set("METEOR_SAVE_DYNAMIC_IMPORT_CACHE", "true");
  s.cd("dynamic-import-test-app-cache", run.bind(s, true));
});

function run(isProduction) {
  const sandbox = this;
  const args = [
    "test",
    "--once",
    "--full-app",
    "--driver-package", "meteortesting:mocha"
  ];
  
  // For meteortesting:mocha to work we must set test broswer driver
  // See https://github.com/meteortesting/meteor-mocha
  sandbox.set("TEST_BROWSER_DRIVER", "puppeteer");

  if (isProduction) {
    sandbox.set("NODE_ENV", "production");
    args.push("--production");
  } else {
    sandbox.set("NODE_ENV", "development");
  }

  const run = sandbox.run(...args);

  run.waitSecs(90);
  run.match("App running at");
  run.match("SERVER FAILURES: 0");
  run.match("CLIENT FAILURES: 0");
  run.waitSecs(30);
  run.expectExit(0);
}
