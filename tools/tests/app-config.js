var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("mainModule", function () {
  const s = new Sandbox();
  s.createApp("app-config-mainModule", "app-config");
  s.cd("app-config-mainModule");

  const run = s.run(
    "test",
    "--full-app",
    "--driver-package", "dispatch:mocha-phantomjs"
  );

  run.waitSecs(60);
  run.match("App running at");

  function check(mainModule) {
    writeConfig(s, run, mainModule);
  }

  check();

  check(null);

  check("oyez");

  check({});

  check(false);

  check({
    client: false,
    server: "abc",
  });

  check({
    client: "abc",
    server: false,
  });

  check({
    web: false,
  });

  check({
    os: false,
  });

  check({
    client: "a",
    os: "bc",
  });

  check({
    client: "b.js",
    server: "abc",
  });

  check({
    client: "./c",
    server: "/ac",
  });

  check({
    server: "./a",
    web: "ab",
  });

  check({
    client: "ac.js",
    os: "a",
  });

  check({
    web: "bc",
    server: "a",
  });

  check({
    server: "b.js",
    client: "abc",
  });

  check({
    client: "abc",
  });

  check({
    server: "b.js",
  });

  check({
    client: "/ac",
    server: "./c",
  });

  check({
    os: "ab",
    client: "./a",
  });

  check({
    server: "ac.js",
    web: "a",
  });

  check(null);

  check();

  run.stop();
});

function writeConfig(s, run, mainModule) {
  const json = JSON.parse(s.read("package.json"));

  json.meteor = {
    // Make sure the tests.js module is always loaded eagerly.
    testModule: "tests.js"
  };

  if (typeof mainModule === "undefined") {
    delete json.meteor.mainModule;
  } else {
    json.meteor.mainModule = mainModule;
  }

  s.write("package.json", JSON.stringify(json, null, 2) + "\n");

  run.waitSecs(10);
  run.forbid(" 0 passing ");
  run.match("SERVER FAILURES: 0");
  run.match("CLIENT FAILURES: 0");
}

selftest.define("testModule", function () {
  const s = new Sandbox();
  s.createApp("app-config-mainModule", "app-config");
  s.cd("app-config-mainModule");

  const run = s.run(
    "test",
    // Not running with the --full-app option here, in order to exercise
    // the normal `meteor test` behavior.
    "--driver-package", "dispatch:mocha-phantomjs"
  );

  run.waitSecs(60);
  run.match("App running at");

  function check(mainModule) {
    writeConfig(s, run, mainModule);
  }

  check();

  check(false);

  check({
    client: "abc"
  });

  check({
    server: "abc"
  });

  check({
    client: "abc",
    server: "abc"
  });

  check({
    client: "abc",
    server: false
  });

  check({
    client: false,
    server: "abc"
  });

  run.stop();
});
