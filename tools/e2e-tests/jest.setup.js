// jest.setup.js
import chalk from 'chalk';

// Clear NODE_ENV so meteor commands don't inherit any value from the test runner environment
process.env.NODE_ENV = '';

// Set fixed ports for all tests. RSPACK_DEVSERVER_PORT defaults to 18080 to avoid
// colliding with dev servers that some skeletons (e.g. Angular CLI) bundle on :8080.
// Individual tests may override via the `devServerPort` option in testMeteorSkeleton /
// testMeteorBundler, which sets this env var per test run.
process.env.RSPACK_DEVSERVER_PORT = '18080';
process.env.RSDOCTOR_CLIENT_PORT = '8888';
process.env.RSDOCTOR_SERVER_PORT = '8889';

// Client-rendered frameworks (Angular, React, Vue, etc.) may take longer to
// hydrate on slow CI runners. Increase Playwright's default selector/action
// timeout so waitForSelector calls don't race the framework bootstrap.
if (process.env.CI) {
  beforeEach(async () => {
    if (typeof page !== 'undefined') {
      page.setDefaultTimeout(60000);
    }
  });
}

// Retries are only enabled on CI by default — local runs fail fast so flakes
// surface. Set METEOR_E2E_TEST_RETRIES to override (e.g. "0" to disable on CI,
// "2" to allow more retries, any value forces the setting regardless of CI).
const retryOverride = process.env.METEOR_E2E_TEST_RETRIES;
const retryCount = retryOverride !== undefined
  ? Number(retryOverride)
  : (process.env.CI ? 1 : 0);
if (retryCount > 0) {
  jest.retryTimes(retryCount, { logErrorsBeforeRetry: true });
}

// Track attempts per test — Jest 29 doesn't expose currentTestRetryAttempt.
const attemptCounts = new Map();

beforeEach(() => {
  const name = expect.getState().currentTestName || '<unknown>';
  const attemptIndex = attemptCounts.get(name) ?? 0;
  attemptCounts.set(name, attemptIndex + 1);
  globalThis.__e2eIsRetryAttempt = attemptIndex > 0;

  const attemptLabel = attemptIndex > 0 ? chalk.yellow(` (retry ${attemptIndex})`) : '';
  console.log(chalk.cyan(`▶ ${name}`) + attemptLabel);
});

// E2E_FORCE_FLAKY_TEST: force matching tests to fail on the first attempt
// to validate retry isolation. Runs in afterEach so the test body completes
// (including any mutations) before the forced failure.
afterEach(() => {
  const flakyPattern = process.env.E2E_FORCE_FLAKY_TEST;
  if (!flakyPattern) return;
  const name = expect.getState().currentTestName || '<unknown>';
  const attemptsSoFar = attemptCounts.get(name) ?? 0;
  if (attemptsSoFar === 1 && name.includes(flakyPattern)) {
    throw new Error(
      `[E2E_FORCE_FLAKY_TEST] Forcing first-attempt failure for "${name}" ` +
      `(matches pattern "${flakyPattern}"). Retry should pass if isolation works.`
    );
  }
});
