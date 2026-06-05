var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files');

// No need for a high value since the asserts already wait long enough to pass tests
const waitToStart = 5;
// Budget for `meteor build` to fully exit. Doubled on CI where the container
// is resource-constrained and the build can take substantially longer than
// locally.
const buildWaitSecs = process.env.CI ? 90 : 60;

// Applies env var overrides for the duration of `fn`, then restores them on
// every exit path. Required for retry-compatibility: without the try/finally,
// a mid-body failure would leak the mutated env into the subsequent retry and
// into the Sandbox it spawns, producing a different starting state than the
// first attempt.
async function withEnv(overrides, fn) {
  const saved = Object.fromEntries(
    Object.keys(overrides).map(k => [k, process.env[k]])
  );
  Object.assign(process.env, overrides);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function writeModernConfig(s, modernConfig) {
  const json = JSON.parse(s.read("package.json"));

  json.meteor = {
    ...json.meteor,
    modern: modernConfig,
  };

  s.write("package.json", JSON.stringify(json, null, 2) + "\n");
}

async function writeConfig(s, config) {
  const json = JSON.parse(s.read("package.json"));

  json.meteor = {
    ...json.meteor,
    ...config,
  };

  s.write("package.json", JSON.stringify(json, null, 2) + "\n");
}

selftest.define("modern build stack - test terser minifier", async function () {
  await withEnv({ METEOR_MODERN: '' }, async () => {
    const s = new Sandbox();
    await s.init();

    const appName = "terser-app";

    await s.createApp(appName, "modern");
    await s.cd(appName);

    await writeConfig(s, {
      modern: false
    });

    s.set("NODE_INSPECTOR_IPC", "1");

    const runTerser = s.run();
    runTerser.waitSecs(waitToStart);
    await runTerser.match("App running at");
    await runTerser.stop();

    const buildTerser = s.run("build", `../${appName}`);
    buildTerser.waitSecs(60);
    await buildTerser.match("[DEBUG] Minifying using Terser", false, true);

    const terserBuildPath = files.pathJoin(s.cwd, `../${appName}`);
    selftest.expectEqual(files.exists(terserBuildPath), true);
  });
});

selftest.define("modern build stack - test swc minifier", async function () {
  await withEnv({ METEOR_MODERN: 'true' }, async () => {
    const s = new Sandbox();
    await s.init();

    const appName = "modern-swc";

    await s.createApp(appName, "modern");
    await s.cd(appName);

    await writeConfig(s, {
      modern: true,
      mainModule: {
        client: 'client/main.js',
        server: 'server/main.js',
      },
    });

    s.set("NODE_INSPECTOR_IPC", "1");

    await writeModernConfig(s, {
      minifier: true
    });

    const runSwc = s.run();
    runSwc.waitSecs(waitToStart);
    await runSwc.match("App running at");
    await runSwc.stop();

    const buildSwc = s.run("build", `../${appName}`);
    buildSwc.waitSecs(60);
    await buildSwc.match("[DEBUG] Minifying using SWC", false, true);

    // Check what's in the build directory
    const swcBuildPath = files.pathJoin(s.cwd, `../${appName}`);
    selftest.expectEqual(files.exists(swcBuildPath), true);
  });
});

selftest.define("modern build stack - enable build", async function () {
  await withEnv({ METEOR_MODERN: '' }, async () => {
    const s = new Sandbox();
    await s.init();

    await s.createApp("modern", "modern");
    await s.cd("modern");

    s.set("METEOR_PROFILE", "0");
    s.set("NODE_INSPECTOR_IPC", "1");

    await writeModernConfig(s, true);

    const buildSwc = s.run("build", `../modern`);
    buildSwc.waitSecs(buildWaitSecs);
    await buildSwc.expectExit(0);

    const out = buildSwc.getMatcherFullBuffer();

    /* Perserve legacy and modern on build */
    selftest.expectTrue(/_findSources for web\.browser/.test(out));
    selftest.expectTrue(/_findSources for web\.browser\.legacy/.test(out));

    /* Keep rest of modern build stack */
    selftest.expectTrue(/safeWatcher\.watchModern/.test(out));
    selftest.expectTrue(/SWC\.compile/.test(out));
    selftest.expectTrue(out.includes("[DEBUG] Minifying using SWC"));
  });
});

selftest.define("modern build stack - disable build", async function () {
  await withEnv({ METEOR_MODERN: '' }, async () => {
    const s = new Sandbox();
    await s.init();

    await s.createApp("modern", "modern");
    await s.cd("modern");

    s.set("METEOR_PROFILE", "0");
    s.set("NODE_INSPECTOR_IPC", "1");

    await writeModernConfig(s, {
      watcher: false,
      transpiler: false,
      minifier: false,
      webArchOnly: true, // Even when webArchOnly is true, the legacy build should be built
    });

    const buildLegacy = s.run("build", `../modern`);
    buildLegacy.waitSecs(buildWaitSecs);
    await buildLegacy.expectExit(0);

    const out = buildLegacy.getMatcherFullBuffer();

    /* Perserve legacy and modern on build */
    selftest.expectTrue(/_findSources for web\.browser/.test(out));
    selftest.expectTrue(/_findSources for web\.browser\.legacy/.test(out));

    /* Keep rest of modern build stack */
    selftest.expectTrue(/safeWatcher\.watchLegacy/.test(out));
    selftest.expectTrue(/Babel\.compile/.test(out));
    selftest.expectTrue(out.includes("[DEBUG] Minifying using Terser"));
  });
});
