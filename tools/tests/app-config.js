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

async function writeModernConfig(s, run, modernConfig, errorPattern) {
  const json = JSON.parse(s.read("package.json"));

  json.meteor = {
    // Make sure the tests.js module is always loaded eagerly.
    testModule: "tests.js"
  };

  if (typeof modernConfig === "undefined") {
    delete json.meteor.modern;
  } else {
    json.meteor.modern = modernConfig;
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

selftest.define("modernConfig", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("app-config-modernConfig", "app-config");
  await s.cd("app-config-modernConfig");

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

  function check(modernConfig) {
    return writeModernConfig(s, run, modernConfig);
  }

  // Test with modern disabled
  await check(false);

  // Test with modern enabled
  await check(true);

  // Test with combined options
  await check({
    transpiler: true,
    watcher: true,
    webArchOnly: true,
    minifier: true,
  });

  await run.stop();
});

async function writeSettingsConfig(s, run, settings) {
  const json = JSON.parse(s.read("package.json"));

  json.meteor = {
    testModule: "tests.js",
  };

  if (typeof settings !== "undefined") {
    json.meteor.settings = settings;
  }

  s.write("package.json", JSON.stringify(json, null, 2) + "\n");

  run.waitSecs(10);
  run.forbid(" 0 passing ");
  await run.match("SERVER FAILURES: 0");
  await run.match("CLIENT FAILURES: 0");
}

selftest.define("packageJsonSettings", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("app-config-settings", "app-config");
  s.cd("app-config-settings");

  s.set("TEST_BROWSER_DRIVER", "puppeteer");

  const run = s.run(
    "test",
    "--full-app",
    "--driver-package", "meteortesting:mocha"
  );

  run.waitSecs(60);
  await run.match("App running at");

  // No settings in package.json → Meteor.settings should be empty
  await writeSettingsConfig(s, run);

  // Arbitrary nested settings object
  await writeSettingsConfig(s, run, {
    packages: { mongo: { reactivity: ["changeStreams", "oplog"] } },
  });

  // Settings with a public subset (client-accessible)
  await writeSettingsConfig(s, run, {
    public: { theme: "dark" },
    secret: "server-only",
  });

  // Remove settings again → back to empty
  await writeSettingsConfig(s, run);

  await run.stop();
});

selftest.define("packageJsonSettings conflicts with --settings flag", async function () {
  var s = new Sandbox({ fakeMongo: true });
  await s.init();

  await s.createApp("app-config-settings-conflict", "standard-app");
  s.cd("app-config-settings-conflict");

  // Write a valid settings file for the --settings flag
  s.write("extra-settings.json", JSON.stringify({ fromFile: true }));

  // Add meteor.settings to package.json so both sources are present
  const json = JSON.parse(s.read("package.json"));
  json.meteor = json.meteor || {};
  json.meteor.settings = { fromPackageJson: true };
  s.write("package.json", JSON.stringify(json, null, 2) + "\n");

  const run = s.run("--settings", "extra-settings.json");
  await run.tellMongo({ stdout: " [initandlisten] waiting for connections on port" });

  run.waitSecs(15);
  await run.match("You have defined settings in both the --settings flag");
  await run.match("Waiting for file change");
  await run.stop();
});
