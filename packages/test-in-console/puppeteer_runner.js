let puppeteer;
try {
  // Prefer the copy bundled inside dev_bundle (local checkout / CI after first run).
  puppeteer = require("../../dev_bundle/lib/node_modules/puppeteer");
} catch {
  // Fallback: globally-installed puppeteer (e.g. on oss-vm where it is pre-installed
  // via `npm install -g puppeteer@23.6.0` and NODE_PATH is set to `npm root -g`).
  puppeteer = require("puppeteer");
}

let testNumber = 0;
// Set once we begin the deliberate teardown (poll() success/failure branch).
// browser.close() naturally fires 'disconnected'; without this flag the
// disconnect handler would treat clean shutdown as an unexpected crash and
// race-win the exit code.
let shuttingDown = false;

// Watchdog: convert silent stalls into actionable failures. The runner used to
// rely entirely on the per-`console`-event heartbeat, which is driven by client
// log output. A client test that hangs awaiting a never-completing Meteor call
// (e.g. a DDP transport regression) produces no console output, so nothing
// fires and the whole run silently waits for the GitHub Actions job timeout.
//
// Default 240s sits above Tinytest's own 3-minute per-test timeouts (server
// branch in tinytest.js, plus the matching client branch added in this PR) so
// the in-suite timeouts get first chance to convert a hung test into a clean
// failure event before the watchdog kills the whole run.
const IDLE_TIMEOUT_MS = parseInt(process.env.PUPPETEER_IDLE_TIMEOUT_MS, 10) || 240000;
const WATCHDOG_TICK_MS = 5000;
let lastActivityAt = Date.now();
const bumpActivity = () => {
  lastActivityAt = Date.now();
};

function fail(reason, code = 1) {
  // Best-effort exit. Some callers may already have torn down the browser;
  // log first so the reason always lands in CI output.
  console.error(reason);
  process.exit(code);
}

async function dumpDiagnostics(page, label) {
  const safe = async (fn, fallback) => {
    try {
      return await fn();
    } catch (e) {
      return fallback ?? `<error: ${e.message}>`;
    }
  };
  const clientTest = await safe(
    () => page.evaluate(() => __Tinytest._getCurrentRunningTestOnClient()),
    "<unavailable>",
  );
  const serverTest = await safe(
    () => page.evaluate(async () => await __Tinytest._getCurrentRunningTestOnServer()),
    "<unavailable>",
  );
  const ddpState = await safe(
    () =>
      page.evaluate(() => {
        // `Meteor` is exported by the meteor package and lives on
        // Package.meteor.Meteor in the bundled output; it is not a top-level
        // page global. Fall back to a top-level `Meteor` if some build mode
        // exposes it that way.
        const meteorPkg =
          (typeof Package !== "undefined" && Package.meteor && Package.meteor.Meteor) ||
          (typeof Meteor !== "undefined" ? Meteor : null);
        const conn = meteorPkg && meteorPkg.connection;
        if (!conn) return { error: "Meteor.connection unavailable" };
        const status = typeof conn.status === "function" ? conn.status() : null;
        const pendingMethods = [];
        const methodInvokers = conn._methodInvokers || {};
        for (const id of Object.keys(methodInvokers)) {
          const inv = methodInvokers[id];
          pendingMethods.push({
            id,
            method: inv && inv._message && inv._message.method,
            sentByClient: !!(inv && inv.sentMessage),
          });
        }
        const subs = conn._subscriptions || {};
        const pendingSubs = [];
        for (const id of Object.keys(subs)) {
          const sub = subs[id];
          if (!sub || !sub.ready) {
            pendingSubs.push({ id, name: sub && sub.name });
          }
        }
        return { status, pendingMethods, pendingSubs };
      }),
    {},
  );
  console.error(`=== ${label} ===`);
  console.error(`  current client test: ${clientTest}`);
  console.error(`  current server test: ${serverTest}`);
  console.error(`  ddp: ${JSON.stringify(ddpState)}`);
  await safe(() => page.screenshot({ path: `puppeteer-${label}.png`, fullPage: true }), null);
}

async function runNextUrl(browser) {
  const page = await browser.newPage();

  page.on("console", async (msg) => {
    bumpActivity();
    const text = msg.text();
    if (text.includes("Permissions policy violation")) {
      return;
    }
    if (text) console.log(text);
    else {
      testNumber++;
      const currentClientTest = await page.evaluate(() =>
        __Tinytest._getCurrentRunningTestOnClient(),
      );
      if (currentClientTest !== "") {
        console.log(`Currently running on the client test: ${currentClientTest}`);
        return;
      }
      // If we get here is because we have not yet started the test on the client
      const currentServerTest = await page.evaluate(
        async () => await __Tinytest._getCurrentRunningTestOnServer(),
      );

      if (currentServerTest !== "") {
        console.log(`Currently running on the server test: ${currentServerTest}`);
        return;
      }
      // we were not able to find the name of the test, this is a way to make sure the test is still running
      console.log(`Test number: ${testNumber}`);
    }
  });

  // Surface every browser-side failure mode that was previously silent.
  page.on("pageerror", (err) => {
    bumpActivity();
    console.error(`pageerror: ${err && err.message}\n${(err && err.stack) || ""}`);
  });
  page.on("error", (err) => {
    if (shuttingDown) return;
    // 'error' fires when the page process itself crashes — fatal for the run.
    console.error(`page crashed: ${err && err.message}\n${(err && err.stack) || ""}`);
    fail("aborting because the puppeteer page crashed");
  });
  page.on("requestfailed", (req) => {
    bumpActivity();
    const failure = req.failure();
    console.error(
      `request failed: ${req.url()} — ${failure ? failure.errorText : "<no failure info>"}`,
    );
  });
  page.on("requestfinished", () => bumpActivity());
  browser.on("disconnected", () => {
    if (shuttingDown) return;
    fail("aborting because the puppeteer browser disconnected unexpectedly");
  });

  if (!process.env.URL) {
    process.exit(1);
    return;
  }

  // Use domcontentloaded: Meteor apps connect via DDP after DOM parse and never
  // fire the default 'load' event in the traditional sense. Increase timeout to
  // 90 s to handle slow first-run builds on CI / underpowered machines.
  await page.goto(process.env.URL, {
    timeout: 90000,
    waitUntil: "domcontentloaded",
  });
  bumpActivity();

  // Start the watchdog only after the initial navigation succeeded so a slow
  // build does not get spuriously flagged.
  const watchdog = setInterval(async () => {
    const idleFor = Date.now() - lastActivityAt;
    if (idleFor < IDLE_TIMEOUT_MS) return;
    clearInterval(watchdog);
    try {
      await dumpDiagnostics(page, "watchdog-stall");
    } finally {
      fail(
        `watchdog: no browser activity for ${idleFor}ms — aborting (idle limit ${IDLE_TIMEOUT_MS}ms)`,
      );
    }
  }, WATCHDOG_TICK_MS);
  watchdog.unref?.();

  async function poll() {
    if (await isDone(page)) {
      clearInterval(watchdog);
      const failCount = await getFailCount(page);
      console.log(`Tests complete with ${failCount} failures`);
      console.log(`Tests complete with ${await getPassCount(page)} passes`);
      shuttingDown = true;
      if (failCount > 0) {
        const failed = await getFailed(page);
        failed.map((f) => console.log(`${f.name} failed: ${f.info}`));
        await page.close();
        await browser.close();
        process.exit(1);
      } else {
        await page.close();
        await browser.close();
        process.exit(0);
      }
    } else {
      setTimeout(poll, 1000);
    }
  }

  await poll();
}

/**
 *
 * @param page
 * @return {Promise<boolean>}
 */
async function isDone(page) {
  return await page.evaluate(function () {
    if (typeof TEST_STATUS !== "undefined") {
      return TEST_STATUS.DONE;
    }

    return typeof DONE !== "undefined" && DONE;
  });
}

/**
 *
 * @param page
 * @return {Promise<number>}
 */
async function getPassCount(page) {
  return await page.evaluate(function () {
    if (typeof TEST_STATUS !== "undefined") {
      return TEST_STATUS.PASSED;
    }

    return typeof PASSED !== "undefined" && PASSED;
  });
}

/**
 *
 * @param page
 * @return {Promise<number>}
 */
async function getFailCount(page) {
  return await page.evaluate(function () {
    if (typeof TEST_STATUS !== "undefined") {
      return TEST_STATUS.FAILURES;
    }

    return typeof FAILURES !== "undefined" && FAILURES;
  });
}

/**
 *
 * @param page
 * @return {Promise<[{name: string, info: string}]>}
 */
async function getFailed(page) {
  return await page.evaluate(function () {
    if (typeof TEST_STATUS !== "undefined") {
      return TEST_STATUS.WHERE_FAILED;
    }
    return typeof WHERE_FAILED !== "undefined" && WHERE_FAILED;
  });
}

async function runTests() {
  console.log(`Running test with Puppeteer at ${process.env.URL}`);

  // --no-sandbox and --disable-setuid-sandbox must be disabled for CI compatibility
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
    headless: "new",
  });
  console.log(`Using version: ${await browser.version()}`);
  await runNextUrl(browser);
}

// Translate signals from run.sh / GitHub Actions into a non-zero exit so the
// CI step is reported as failed (with whatever diagnostics already landed in
// the log) instead of being marked cancelled.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.error(`puppeteer_runner: received ${sig}, exiting`);
    process.exit(1);
  });
}

runTests().catch((e) => {
  console.error(`something broke while running puppeteer:`, e);
  process.exit(1);
});
