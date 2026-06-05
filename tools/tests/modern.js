var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

// No need for a high value since the asserts already wait long enough to pass tests
const waitToStart = 5;

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

selftest.define("modern build stack - legacy", async function () {
  await withEnv({ METEOR_MODERN: 'false' }, async () => {
    const s = new Sandbox();
    await s.init();

    await s.createApp("modern", "modern");
    await s.cd("modern");

    s.set("METEOR_PROFILE", "0");

    await writeModernConfig(s, false);

    const run = s.run();

    run.waitSecs(waitToStart);
    await run.match("App running at");

    const out = run.getMatcherFullBuffer();

    /* check legacy stack */
    selftest.expectTrue(/Babel\.compile/.test(out));
    selftest.expectTrue(/safeWatcher\.watchLegacy/.test(out));
    selftest.expectTrue(/_findSources for web\.browser\.legacy/.test(out));

    /* check debug stack */
    selftest.expectTrue(/server\/main\.js:6:22/.test(out));

    await run.stop();
  });
});

selftest.define("modern build stack", async function () {
  await withEnv({ METEOR_MODERN: '' }, async () => {
    const s = new Sandbox();
    await s.init();

    await s.createApp("modern", "modern");
    await s.cd("modern");

    s.set("METEOR_PROFILE", "0");

    await writeModernConfig(s, true);

    const run = s.run();

    run.waitSecs(waitToStart);
    await run.match("App running at");

    const out = run.getMatcherFullBuffer();

    /* check modern stack */
    selftest.expectTrue(/SWC\.compile/.test(out));
    selftest.expectTrue(/safeWatcher\.watchModern/.test(out));
    selftest.expectTrue(/_findSources for web\.browser/.test(out));

    selftest.expectFalse(/Babel\.compile/.test(out));
    selftest.expectFalse(/_findSources for web\.browser\.legacy/.test(out));

    /* check debug stack */
    selftest.expectTrue(/server\/main\.js:6:22/.test(out));

    await run.stop();
  });
});

selftest.define("modern build stack - disable transpiler", async function () {
  await withEnv({ METEOR_MODERN: '' }, async () => {
    const s = new Sandbox();
    await s.init();

    await s.createApp("modern", "modern");
    await s.cd("modern");

    s.set("METEOR_PROFILE", "0");

    await writeModernConfig(s, { transpiler: false });

    const run = s.run();

    run.waitSecs(waitToStart);
    await run.match("App running at");

    const out = run.getMatcherFullBuffer();

    /* disable transpiler */
    selftest.expectFalse(/SWC\.compile/.test(out));
    selftest.expectTrue(/Babel\.compile/.test(out));

    /* Keep rest of modern build stack */
    selftest.expectTrue(/safeWatcher\.watchModern/.test(out));
    selftest.expectTrue(/_findSources for web\.browser/.test(out));
    selftest.expectFalse(/_findSources for web\.browser\.legacy/.test(out));

    await run.stop();
  });
});

selftest.define("modern build stack - disable watcher", async function () {
  await withEnv({ METEOR_MODERN: '' }, async () => {
    const s = new Sandbox();
    await s.init();

    await s.createApp("modern", "modern");
    await s.cd("modern");

    s.set("METEOR_PROFILE", "0");

    await writeModernConfig(s, { watcher: false });

    const run = s.run();

    run.waitSecs(waitToStart);
    await run.match("App running at");

    const out = run.getMatcherFullBuffer();

    /* disable watcher */
    selftest.expectFalse(/safeWatcher\.watchModern/.test(out));
    selftest.expectTrue(/safeWatcher\.watchLegacy/.test(out));

    /* Keep rest of modern build stack */
    selftest.expectTrue(/SWC\.compile/.test(out));
    selftest.expectTrue(/_findSources for web\.browser/.test(out));
    selftest.expectFalse(/_findSources for web\.browser\.legacy/.test(out));

    await run.stop();
  });
});

selftest.define("modern build stack - disable webArchOnly", async function () {
  await withEnv({ METEOR_MODERN: '' }, async () => {
    const s = new Sandbox();
    await s.init();

    await s.createApp("modern", "modern");
    await s.cd("modern");

    s.set("METEOR_PROFILE", "0");

    await writeModernConfig(s, { webArchOnly: false });

    const run = s.run();

    run.waitSecs(waitToStart);
    await run.match("App running at");

    const out = run.getMatcherFullBuffer();

    /* disable webArchOnly */
    selftest.expectTrue(/_findSources for web\.browser/.test(out));
    selftest.expectTrue(/_findSources for web\.browser\.legacy/.test(out));

    /* Keep rest of modern build stack */
    selftest.expectTrue(/safeWatcher\.watchModern/.test(out));
    selftest.expectTrue(/SWC\.compile/.test(out));

    await run.stop();
  });
});
