const selftest = require("../tool-testing/selftest.js");
const Sandbox = selftest.Sandbox;

const BUNDLE_PATH = "_build/main-prod/server-rspack.js";

function monitorBundle(s, previousMarker, nextMarker) {
  let disappeared = false;
  let error = null;
  let unexpectedSize = null;

  const sample = () => {
    try {
      const contents = s.read(BUNDLE_PATH);
      if (contents === null) {
        disappeared = true;
      } else if (!contents.includes(previousMarker) && !contents.includes(nextMarker)) {
        unexpectedSize = Buffer.byteLength(contents);
      }
    } catch (e) {
      if (e.code === "ENOENT") {
        disappeared = true;
      } else {
        error = e;
      }
    }
  };

  sample();
  const timer = setInterval(sample, 5);

  return () => {
    clearInterval(timer);
    sample();
    return { disappeared, error, unexpectedSize };
  };
}

function assertCompiled(observation, version) {
  if (observation.error) {
    throw observation.error;
  }
  if (observation.disappeared) {
    selftest.fail(`Rspack server bundle disappeared during rebuild ${version}`);
  }
  if (observation.unexpectedSize !== null) {
    selftest.fail(
      `Rspack server bundle lost its compiled module during rebuild ${version} ` +
        `(${observation.unexpectedSize} bytes)`,
    );
  }
}

async function rebuild(s, run, version) {
  const previousMarker = `RSPACK_WATCH_BUILD_CONTEXT v${version - 1}`;
  const marker = `RSPACK_WATCH_BUILD_CONTEXT v${version}`;
  const stopMonitoring = monitorBundle(s, previousMarker, marker);
  let observation;

  try {
    s.write("server/main.js", `console.log('${marker}');\n`);
    run.waitSecs(240);
    await run.match(marker);
  } finally {
    observation = stopMonitoring();
  }

  assertCompiled(observation, version);
  const contents = s.read(BUNDLE_PATH);
  if (!contents || !contents.includes(marker)) {
    selftest.fail(`Rspack server bundle does not contain rebuild ${version}`);
  }
}

selftest.define("rspack: watch rebuilds preserve compiled output", ["checkout"], async function () {
  const s = new Sandbox();
  await s.init();
  await s.createApp("app", "rspack-watch-build-context", {
    dontPrepareApp: true,
  });
  s.cd("app");

  const run = s.run(
    "--production",
    "--port",
    "21463",
    "--exclude-archs",
    "web.browser.legacy,web.cordova",
  );

  run.waitSecs(480);
  await run.match("App running at");

  const initialBundle = s.read(BUNDLE_PATH);
  if (!initialBundle || !initialBundle.includes("RSPACK_WATCH_BUILD_CONTEXT v0")) {
    selftest.fail("Rspack server bundle was not compiled before the rebuilds");
  }

  await rebuild(s, run, 1);
  await rebuild(s, run, 2);
  await run.stop();
});
