// A network change can cancel initial scripts while DOMContentLoaded still
// succeeds. Recover only before the test runtime exists, never rerun a suite.
async function loadTestPage(page, url, log = console.log) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let failedRequest;
    const onRequestFailed = (request) => {
      if (
        request.failure()?.errorText === "net::ERR_NETWORK_CHANGED" &&
        ["document", "script"].includes(request.resourceType()) &&
        new URL(request.url()).origin === new URL(url).origin
      ) {
        failedRequest = request.url();
      }
    };
    page.on("requestfailed", onRequestFailed);

    let navigationError;
    try {
      await page.goto(url, { timeout: 90000, waitUntil: "domcontentloaded" });
    } catch (error) {
      navigationError = error;
    } finally {
      page.off("requestfailed", onRequestFailed);
    }

    // Do not classify arbitrary console messages, script exceptions, or test
    // failures as infrastructure errors. Require Chrome's request failure.
    if (!failedRequest) {
      if (navigationError) throw navigationError;
      return;
    }
    if (navigationError && !navigationError.message.includes("net::ERR_NETWORK_CHANGED")) {
      throw navigationError;
    }

    // This runs before the suite's stall timer. A blocked renderer must fail
    // closed rather than leave this safety check pending indefinitely.
    let timer;
    let initialized;
    try {
      initialized = await Promise.race([
        page.evaluate(
          () =>
            typeof __Tinytest !== "undefined" ||
            typeof TEST_STATUS !== "undefined" ||
            typeof DONE !== "undefined",
        ),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Test runtime initialization check timed out after 5000ms")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (initialized) {
      throw new Error(
        `net::ERR_NETWORK_CHANGED loading ${failedRequest}; test runtime already initialized, refusing to rerun tests`,
      );
    }
    if (attempt > 0) {
      throw new Error(`net::ERR_NETWORK_CHANGED loading ${failedRequest} after bootstrap recovery`);
    }
    log(
      `net::ERR_NETWORK_CHANGED loading ${failedRequest} before the test runtime loaded; retrying navigation once`,
    );
  }
}

module.exports = { loadTestPage };
