let puppeteer;
try {
  // Prefer the copy bundled inside dev_bundle (local checkout / CI after first run).
  puppeteer = require("../../dev_bundle/lib/node_modules/puppeteer");
} catch (_) {
  // Fallback: globally-installed puppeteer (e.g. on oss-vm where it is pre-installed
  // via `npm install -g puppeteer@23.6.0` and NODE_PATH is set to `npm root -g`).
  puppeteer = require("puppeteer");
}

let testNumber = 0;
// Track the last time we saw any test output to detect genuine hangs.
let lastActivityTime = Date.now();
// Watchdog: if no activity for 10 minutes, force exit with failure.
// Uses stderr so progress is visible even when stdout is buffered by a pipe.
const WATCHDOG_TIMEOUT_MS = 10 * 60 * 1000;
const watchdog = setInterval(() => {
  const idleMs = Date.now() - lastActivityTime;
  if (idleMs > WATCHDOG_TIMEOUT_MS) {
    process.stderr.write(
      `\n[puppeteer_runner] No test activity for ${Math.round(
        idleMs / 1000
      )}s — watchdog timeout, exiting with failure.\n`
    );
    process.exit(1);
  } else {
    process.stderr.write(
      `[puppeteer_runner] Heartbeat: ${testNumber} ticks, idle ${Math.round(
        idleMs / 1000
      )}s\n`
    );
  }
}, 60 * 1000); // check every 60 s
watchdog.unref(); // don't prevent natural exit

async function runNextUrl(browser) {
  const page = await browser.newPage();

  // page.on('console', msg => {
  //   console.log('PAGE LOG:', msg.text());
  // });

  page.on("console", async (msg) => {
    // this is a way to make sure the travis does not timeout
    // if the test is running for too long without any output to the console (10 minutes)
    const text = msg.text();
    if (text.includes("Permissions policy violation")) {
      return;
    }
    if (text) {
      lastActivityTime = Date.now();
      console.log(text);
    } else {
      testNumber++;
      lastActivityTime = Date.now();

      const isParallel = await page
        .evaluate(
          () =>
            !!(
              __meteor_runtime_config__ &&
              __meteor_runtime_config__.tinytestParallel
            )
        )
        .catch(() => false);

      if (isParallel) {
        // In parallel mode several tests run simultaneously — just report the count.
        const currentServerTest = await page
          .evaluate(
            async () => await __Tinytest._getCurrentRunningTestOnServer()
          )
          .catch(() => "");
        const currentClientTest = await page
          .evaluate(() => __Tinytest._getCurrentRunningTestOnClient())
          .catch(() => "");
        const parts = [];
        if (currentClientTest) parts.push("client: " + currentClientTest);
        if (currentServerTest) parts.push("server: " + currentServerTest);
        if (parts.length > 0) {
          console.log("[parallel] active — " + parts.join(" | "));
        } else {
          console.log("[parallel] test tick #" + testNumber);
        }
        return;
      }

      const currentClientTest = await page.evaluate(() =>
        __Tinytest._getCurrentRunningTestOnClient()
      );
      if (currentClientTest !== "") {
        console.log(
          `Currently running on the client test: ${currentClientTest}`
        );
        return;
      }
      // If we get here is because we have not yet started the test on the client
      const currentServerTest = await page.evaluate(
        async () => await __Tinytest._getCurrentRunningTestOnServer()
      );

      if (currentServerTest !== "") {
        console.log(
          `Currently running on the server test: ${currentServerTest}`
        );
        return;
      }
      // we were not able to find the name of the test, this is a way to make sure the test is still running
      console.log(`Test number: ${testNumber}`);
    }
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

  async function poll() {
    if (await isDone(page)) {
      const failCount = await getFailCount(page);
      console.log(`Tests complete with ${failCount} failures`);
      console.log(`Tests complete with ${await getPassCount(page)} passes`);
      if (failCount > 0) {
        const failed = await getFailed(page);
        failed.map((f) => console.log(`${f.name} failed: ${f.info}`));
      }
      await page.close();
      await browser.close();
      // Use exitCode + natural exit so stdout is fully flushed before the
      // process terminates (process.exit() can silently discard buffered data
      // when writing to a non-TTY pipe or file).
      process.exitCode = failCount > 0 ? 1 : 0;
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
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
    ],
    headless: "new",
  });
  console.log(`Using version: ${await browser.version()}`);
  await runNextUrl(browser);
}

runTests().catch((e) =>
  console.log(`something broke while running puppeter: `, e)
);
