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
    const json = JSON.parse(s.read("package.json"));

    let shouldWrite = true;
    if (typeof mainModule === "undefined") {
      if ("meteor" in json) {
        delete json.meteor;
      } else {
        shouldWrite = false;
      }
    } else {
      json.meteor = { mainModule };
    }

    if (shouldWrite) {
      s.write("package.json", JSON.stringify(json, null, 2) + "\n");
    }

    run.waitSecs(10);
    run.match("SERVER FAILURES: 0");
    run.match("CLIENT FAILURES: 0");
  }

  check();

  check(null);

  check("oyez");

  check({});

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
});
