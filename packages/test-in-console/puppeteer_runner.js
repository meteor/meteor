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

// The suite is driven entirely by console output from the page: if the app
// server dies (e.g. an uncaught exception), `isDone` never flips and the poll
// loop below would otherwise spin until the CI job's own timeout — burning a
// runner for over an hour and reporting nothing useful. Bail out after a
// stretch of total silence instead, naming the test that was in flight.
const STALL_TIMEOUT_MS = Number(process.env.TEST_STALL_TIMEOUT_MIN || 10) * 60 * 1000;

let lastOutputAt = Date.now();

async function runNextUrl(browser) {
  const page = await browser.newPage();

  // page.on('console', msg => {
  //   console.log('PAGE LOG:', msg.text());
  // });

  page.on("console", async (msg) => {
    lastOutputAt = Date.now();
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
        await page.close();
        await browser.close();
        process.exit(1);
      } else {
        await page.close();
        await browser.close();
        process.exit(0);
      }
    } else {
      const idleMs = Date.now() - lastOutputAt;
      if (idleMs > STALL_TIMEOUT_MS) {
        await reportStall(page, idleMs);
        await browser.close().catch(() => {});
        process.exit(1);
      }
      setTimeout(poll, 1000);
    }
  }

  // Start the clock here, not at module load: everything before this point
  // (build, app boot, page load) legitimately produces no page output.
  lastOutputAt = Date.now();

  await poll();
}

/**
 * Print why the run is being abandoned, naming whatever test was still in
 * flight. Reading it is best-effort: if the app server is what died, these
 * evaluations will fail too, and that in itself is worth reporting.
 *
 * @param page
 * @param idleMs how long the page has produced no output
 */
async function reportStall(page, idleMs) {
  const idle =
    idleMs < 60000 ? `${Math.round(idleMs / 1000)}s` : `${Math.round(idleMs / 60000)}min`;
  console.log(`\nNo test output for ${idle} — treating the run as stalled.`);

  try {
    const clientTest = await page.evaluate(() => __Tinytest._getCurrentRunningTestOnClient());
    console.log(`Client test in flight: ${clientTest || "(none)"}`);
  } catch (e) {
    console.log(`Could not read the client test: ${e.message}`);
  }

  try {
    const serverTest = await page.evaluate(
      async () => await __Tinytest._getCurrentRunningTestOnServer(),
    );
    console.log(`Server test in flight: ${serverTest || "(none)"}`);
  } catch (e) {
    console.log(`Could not read the server test (the app server may have died): ${e.message}`);
  }

  console.log("Raise TEST_STALL_TIMEOUT_MIN if a legitimately slow test needs longer.");
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

runTests().catch((e) => console.log(`something broke while running puppeter: `, e));
