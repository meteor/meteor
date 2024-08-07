var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("mainModule", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("app-config-mainModule", "app-config");
  s.cd("app-config-mainModule");

  // For meteortesting:mocha to work we must set test broswer driver
  // See https://github.com/meteortesting/meteor-mocha
  s.set("TEST_BROWSER_DRIVER", "puppeteer");

  const run = s.run(
    "test",
    "--full-app",
    "--driver-package", "meteortesting:mocha"
  );

  run.waitSecs(60);
  await run.match("App running at");

  function check(mainModule, errorPattern) {
    return writeConfig(s, run, mainModule, errorPattern);
  }

  await check();

  await check(null);

  await check("oyez", /Could not resolve meteor.mainModule/);

  await check({});

  await check(false);

  await check({
    client: false,
    server: "abc",
  });

  await check({
    client: "abc",
    server: false,
  });

  await check({
    web: false,
  });

  await check({
    os: false,
  });

  await check({
    client: "a",
    os: "bc",
  });

  await check({
    client: "b.js",
    server: "abc",
  });

  await check({
    client: "./c",
    server: "/ac",
  });

  await check({
    server: "./a",
    web: "ab",
  });

  await check({
    client: "ac.js",
    os: "a",
  });

  await check({
    web: "bc",
    server: "a",
  });

  await check({
    server: "b.js",
    client: "abc",
  });

  await check({
    client: "abc",
  });

  await check({
    server: "b.js",
  });

  await check({
    client: "/ac",
    server: "./c",
  });

  await check({
    os: "ab",
    client: "./a",
  });

  await check({
    server: "ac.js",
    web: "a",
  });

  await check(null);

  await check();

  await run.stop();
});

async function writeConfig(s, run, mainModule, errorPattern) {
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

  if (errorPattern instanceof RegExp) {
    await run.match(errorPattern);
  } else {
    run.forbid(" 0 passing ");
    await run.match("SERVER FAILURES: 0");
    await run.match("CLIENT FAILURES: 0");
  }
}

selftest.define("testModule", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("app-config-mainModule", "app-config");
  await s.cd("app-config-mainModule");

  // For meteortesting:mocha to work we must set test broswer driver
  // See https://github.com/meteortesting/meteor-mocha
  s.set("TEST_BROWSER_DRIVER", "puppeteer");

  const run = s.run(
    "test",
    // Not running with the --full-app option here, in order to exercise
    // the normal `meteor test` behavior.
    "--driver-package", "meteortesting:mocha"
  );

  run.waitSecs(60);
  await run.match("App running at");

  function check(mainModule) {
    return writeConfig(s, run, mainModule);
  }

  await check();

  await check(false);

  await check({
    client: "abc"
  });

  await check({
    server: "abc"
  });

  await check({
    client: "abc",
    server: "abc"
  });

  await check({
    client: "abc",
    server: false
  });

  await check({
    client: false,
    server: "abc"
  });

  await run.stop();
});
