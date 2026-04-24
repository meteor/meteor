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

async function runNextUrl(browser) {
  const page = await browser.newPage();

  // Forward page errors (uncaught exceptions + failed requests) so we
  // can see when a package script blows up and never exposes runTests.
  page.on("pageerror", (err) => {
    console.log(`[page pageerror] ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    console.log(
      `[page requestfailed] ${req.method()} ${req.url()} `
      + `- ${req.failure() && req.failure().errorText}`,
    );
  });

  page.on("console", async (msg) => {
    // if the test is running for too long without any output to the console (10 minutes)
    const text = msg.text();
    if (text.includes("Permissions policy violation")) {
      return;
    }
    if (text) console.log(text);
    else {
      testNumber++;
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

  // Navigate the page, but don't block on any lifecycle event. For shards
  // with many packages the `domcontentloaded` / `load` events can be
  // delayed indefinitely (autoupdate + DDP reconnects keep resetting the
  // page lifecycle), while `TEST_STATUS` can still be populated and
  // DONE=true reached long before any lifecycle event fires. We therefore
  // fire-and-forget the goto and rely entirely on the poll() below to
  // detect completion.
  //
  // Keep the short "commit" waitUntil so the URL is set before we start
  // evaluating in the page — anything slower would block us for no good
  // reason. Errors are logged but never fatal: if commit itself fails,
  // poll() may still succeed once the Chrome-side load races to finish.
  // Navigate using domcontentloaded with a short timeout. If the event
  // doesn't fire we still fall through — the subsequent runTests() probe
  // + poll loop don't require any particular lifecycle state. Using a
  // Puppeteer-supported value is important: older values like "commit"
  // throw an "Unknown value for options.waitUntil" error that aborts the
  // whole navigation, leaving the page on about:blank.
  const navTimeoutMs = parseInt(
    process.env.PUPPETEER_NAV_TIMEOUT_MS || "120000",
    10,
  );
  console.log(`Navigation timeout (domcontentloaded): ${navTimeoutMs}ms`);
  const gotoStarted = Date.now();
  try {
    await page.goto(process.env.URL, {
      timeout: navTimeoutMs,
      waitUntil: "domcontentloaded",
    });
    console.log(
      `[puppeteer] domcontentloaded at ${Math.round(
        (Date.now() - gotoStarted) / 1000,
      )}s`,
    );
  } catch (err) {
    console.log(
      `[puppeteer] goto ${err.name}: ${err.message} — `
      + `falling through (page likely still loading)`,
    );
  }

  // Invoke runTests() ourselves once the window.runTests export is visible.
  // The test-runner app that historically called this on the app side was
  // removed in Meteor 3.x and never replaced; puppeteer invocation is the
  // reliable way to ensure it runs exactly once per page load.
  const triggerStart = Date.now();
  const triggerDeadlineMs = parseInt(
    process.env.PUPPETEER_TRIGGER_TIMEOUT_MS || "120000",
    10,
  );
  let triggered = false;
  while (!triggered && Date.now() - triggerStart < triggerDeadlineMs) {
    try {
      triggered = await page.evaluate(() => {
        // Resolve runTests through either the legacy global (Meteor 2.x
        // style) or the Package namespace (Meteor 3.x modules). Always
        // guard against repeated invocation — Tinytest's
        // _runTestsEverywhere is one-shot per page load.
        let fn = null;
        if (typeof runTests === "function") {
          fn = runTests;
        } else if (typeof Package !== "undefined"
                   && Package["test-in-console"]
                   && typeof Package["test-in-console"].runTests === "function") {
          fn = Package["test-in-console"].runTests;
        }
        if (!fn) return false;
        if (window.__ticRunTestsCalled) return true;
        window.__ticRunTestsCalled = true;
        fn();
        return true;
      });
    } catch (_) {
      // Page may be mid-navigation / context destroyed during reload.
    }
    if (!triggered) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!triggered) {
    // runTests was never reachable in the page. Dump a small diagnostic
    // so the next debugger can tell if it's a missing export, a package
    // load failure, or a script error — without flooding successful runs.
    try {
      const diag = await page.evaluate(() => ({
        hasPackage: typeof Package !== "undefined",
        hasTestInConsole: typeof Package !== "undefined"
          && !!Package["test-in-console"],
        hasRunTestsGlobal: typeof runTests === "function",
        url: location.href,
      }));
      console.log(`[puppeteer] runTests probe diag: ${JSON.stringify(diag)}`);
    } catch (_) { /* ignore */ }
    console.log(
      `[puppeteer] failed to invoke runTests() within `
      + `${triggerDeadlineMs}ms — tests will not run`,
    );
    await browser.close();
    process.exit(2);
  }
  console.log(
    `[puppeteer] runTests() invoked at `
    + `${Math.round((Date.now() - gotoStarted) / 1000)}s`,
  );

  const pollStarted = Date.now();
  // Hard wall-clock deadline for the whole run. If tests truly hung on the
  // browser side we want a crisp failure instead of an infinite wait.
  // Default: 15 min. Override via PUPPETEER_POLL_TIMEOUT_MS.
  const pollDeadlineMs = parseInt(
    process.env.PUPPETEER_POLL_TIMEOUT_MS || "900000",
    10,
  );
  console.log(`Poll deadline: ${pollDeadlineMs}ms`);
  let tickCount = 0;
  async function poll() {
    if (Date.now() - pollStarted > pollDeadlineMs) {
      let current = "(unknown)";
      try {
        current = await page.evaluate(
          () => (typeof __Tinytest !== "undefined"
                 && (__Tinytest._getCurrentRunningTestOnClient()
                  || __Tinytest._getCurrentRunningTestOnServer()))
                || "(no test reported)",
        );
      } catch (_) { /* ignore */ }
      console.log(
        `[puppeteer] poll deadline hit (${Math.round(
          (Date.now() - pollStarted) / 1000,
        )}s) — aborting. Last running test: ${current}`,
      );
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
      process.exit(3);
    }

    if (await isDone(page)) {
      const failCount = await getFailCount(page);
      const passCount = await getPassCount(page);
      console.log(
        `Tests complete with ${failCount} failures, ${passCount} passes `
        + `(${Math.round((Date.now() - pollStarted) / 1000)}s)`,
      );
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
      tickCount += 1;
      // Every ~10s, print a heartbeat showing the current-running test so
      // long shards don't look hung.
      if (tickCount % 10 === 0) {
        const elapsed = Math.round((Date.now() - pollStarted) / 1000);
        let current = "(unknown)";
        try {
          current = await page.evaluate(
            () => (typeof __Tinytest !== "undefined"
                   && (__Tinytest._getCurrentRunningTestOnClient()
                    || __Tinytest._getCurrentRunningTestOnServer()))
                  || "(no test reported)",
          );
        } catch (_) { /* page may be mid-navigation */ }
        console.log(`[puppeteer] tests running (${elapsed}s), current: ${current}`);
      }
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
  // page.evaluate can throw if the JS context was destroyed mid-navigation
  // (e.g. during a Meteor autoupdate reload). Treat those transient errors
  // as "not done yet" instead of crashing the runner.
  try {
    return await page.evaluate(function () {
      if (typeof TEST_STATUS !== "undefined") {
        return TEST_STATUS.DONE;
      }
      return typeof DONE !== "undefined" && DONE;
    });
  } catch (_) {
    return false;
  }
}

/**
 *
 * @param page
 * @return {Promise<number>}
 */
async function getPassCount(page) {
  try {
    return await page.evaluate(function () {
      if (typeof TEST_STATUS !== "undefined") {
        return TEST_STATUS.PASSED;
      }
      return typeof PASSED !== "undefined" && PASSED;
    });
  } catch (_) {
    return 0;
  }
}

/**
 *
 * @param page
 * @return {Promise<number>}
 */
async function getFailCount(page) {
  try {
    return await page.evaluate(function () {
      if (typeof TEST_STATUS !== "undefined") {
        return TEST_STATUS.FAILURES;
      }
      return typeof FAILURES !== "undefined" && FAILURES;
    });
  } catch (_) {
    return 0;
  }
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
