var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("entry module environment overrides preserve architectures", async function () {
  const files = require('../fs/files');
  const { MeteorConfig } = require('../project-context');
  const { getMeteorConfig, setMeteorConfig } = require('../tool-env/meteor-config');
  const appDirectory = files.mkdtemp('app-config-overrides');
  const originalConfig = getMeteorConfig();
  const envNames = [
    'METEOR_CONFIG_CLIENT', 'METEOR_CONFIG_SERVER', 'METEOR_CONFIG_TEST',
    'METEOR_CONFIG_TEST_CLIENT', 'METEOR_CONFIG_TEST_SERVER',
  ];
  const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const mainModule = {
    client: 'client.js',
    server: 'server.js',
    legacy: 'legacy.js',
    'web.cordova': false,
  };
  const testModule = {
    client: 'client-tests.js',
    server: 'server-tests.js',
    legacy: 'legacy-tests.js',
    'web.cordova': false,
  };

  try {
    files.writeFile(files.pathJoin(appDirectory, 'package.json'), JSON.stringify({
      meteor: { mainModule, testModule },
    }));

    for (const overrides of [
      {},
      { METEOR_CONFIG_CLIENT: 'rspack-client.js' },
      { METEOR_CONFIG_SERVER: 'rspack-server.js' },
      { METEOR_CONFIG_TEST_CLIENT: 'rspack-tests.js' },
      { METEOR_CONFIG_TEST_SERVER: 'rspack-tests.js' },
      {
        METEOR_CONFIG_CLIENT: 'rspack-client.js',
        METEOR_CONFIG_SERVER: 'rspack-server.js',
        METEOR_CONFIG_TEST_CLIENT: 'rspack-client-tests.js',
        METEOR_CONFIG_TEST_SERVER: 'rspack-server-tests.js',
      },
    ]) {
      envNames.forEach(name => delete process.env[name]);
      Object.assign(process.env, overrides);
      const config = new MeteorConfig({ appDirectory });
      await selftest.expectEqual(config.getMainModulesByArch(), {
        web: overrides.METEOR_CONFIG_CLIENT || mainModule.client,
        os: overrides.METEOR_CONFIG_SERVER || mainModule.server,
        'web.browser.legacy': mainModule.legacy,
        'web.cordova': false,
      });
      await selftest.expectEqual(config.getTestModulesByArch(), {
        web: overrides.METEOR_CONFIG_TEST_CLIENT || testModule.client,
        os: overrides.METEOR_CONFIG_TEST_SERVER || testModule.server,
        'web.browser.legacy': testModule.legacy,
        'web.cordova': false,
      });
    }
  } finally {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setMeteorConfig(originalConfig);
    files.rm_recursive(appDirectory);
  }
});

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

function writeModernConfig(s, modernConfig) {
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

  return json.meteor;
}

selftest.define("modernConfig", async function () {
  const s = new Sandbox();
  await s.init();

  await s.createApp("app-config-modernConfig", "app-config");
  await s.cd("app-config-modernConfig");

  // For meteortesting:mocha to work we must set test broswer driver
  // See https://github.com/meteortesting/meteor-mocha
  s.set("TEST_BROWSER_DRIVER", "puppeteer");

  async function check(modernConfig) {
    const meteorConfig = writeModernConfig(s, modernConfig);
    const run = s.run(
      "test",
      "--full-app",
      "--driver-package", "meteortesting:mocha"
    );

    run.waitSecs(60);
    await run.match("App running at");
    run.forbid(" 0 passing ");
    await run.match(`client config: ${JSON.stringify(meteorConfig)}`);
    await run.match(/APP SERVER FAILURES: 0[\s\S]*?APP CLIENT FAILURES: 0/);
    await run.stop();
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
});
