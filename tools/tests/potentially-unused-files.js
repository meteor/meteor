import * as selftest from '../tool-testing/selftest.js';
import { sleepMs } from '../utils/utils.js';

// Wait `delayMs` of real wall-clock time, then assert that `pattern` did
// not appear in the unread portion of stdout. The Matcher's `buf` field
// holds only output that has not yet been consumed by a prior match()
// call, so checking it after a sleep tells us whether anything we did
// not already account for arrived during the window.
//
// Avoids the timeout-multiplier path used by `try { match(...) } catch {}`,
// which paid (baseTimeout 20s + waitSecs) * TIMEOUT_SCALE_FACTOR ≈ 200s
// per negative assertion in CI.
async function expectNoOutput(run, pattern, delayMs = 5000) {
  await sleepMs(delayMs);
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  if (re.test(run.stdoutMatcher.buf)) {
    throw new Error(`unexpected output matched ${pattern}`);
  }
}

// All three watch-used-files cases share the same skeleton and the same
// running meteor process — the file mutations are independent and the
// app reaches a quiescent state between each. Running them in one test
// eliminates two cold-starts.
selftest.define('watch-used-files', async () => {
  const s = new selftest.Sandbox();
  await s.init();

  await s.createApp('myapp', 'watch-used-files');
  s.cd('myapp');

  const run = s.run();
  run.waitSecs(30);
  await run.match('App running at');

  const checkClientRefresh = () => run.match('Client modified -- refreshing');
  const checkServerRestart = async () => {
    await run.match('Server modified -- restarting');
    await run.match('Meteor server restarted');
  };
  const noRebuildPattern = /Server modified -- restarting|Client modified -- refreshing/;

  // === Root file mutations ===
  s.write('/client-only.js', '// updated');
  run.waitSecs(5);
  await checkClientRefresh();

  s.write('/server-only.js', '// updated');
  run.waitSecs(5);
  await checkServerRestart();

  s.write('/shared.js', '// updated');
  run.waitSecs(5);
  await checkServerRestart();

  s.write('/unused.js', '// updated');
  await expectNoOutput(run, noRebuildPattern);

  // === Package file mutations ===
  s.write('/packages/partially-used-package/client-only.js', '// updated');
  run.waitSecs(5);
  await checkClientRefresh();

  s.write('/packages/partially-used-package/direct-import.js', '// updated');
  run.waitSecs(5);
  await checkClientRefresh();

  s.write('/packages/partially-used-package/server-only.js', '// updated');
  run.waitSecs(5);
  await checkServerRestart();

  s.write('/packages/partially-used-package/shared.js', '// updated');
  run.waitSecs(5);
  await checkServerRestart();

  s.write('/packages/partially-used-package/unused.js', '// updated');
  await expectNoOutput(run, noRebuildPattern);

  // === Build-plugin file mutations ===
  s.write('/packages/build-plugin/plugin-dep.js', '// updated');
  run.waitSecs(90);
  await checkServerRestart();

  s.write('/unused.no-lazy-finalyzer', '// updated');
  run.waitSecs(5);
  await checkServerRestart();

  s.write('/a.time', '// updated');
  await expectNoOutput(run, /Client modified -- refreshing/);
});
