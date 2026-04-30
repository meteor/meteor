// Roundtrip self-test for `tool-testing/prepared-app-cache.js`. Verifies that
// `Sandbox#createApp` warms a snapshot on first call, reuses it on the second,
// and that the per-isopack absolute paths embedded in `isopack-buildinfo.json`
// get rewritten to the new app's location (so `IsopackCache._checkUpToDate`
// won't reject the cached build for a stale path).

const selftest = require('../tool-testing/selftest.js');
const Sandbox = selftest.Sandbox;
const files = require('../fs/files');

const CACHE_DIR_ENV = 'METEOR_SELFTEST_PREPARED_APP_CACHE_DIR';
const READY_MARKER = '.meteor-selftest-cache-ready';
const SENTINEL_PATH_FILE = '.meteor-selftest-cache-sentinel-path';

async function withTempCacheRoot(fn) {
  const cacheRoot = files.mkdtemp('prepared-app-cache-test');
  const saved = process.env[CACHE_DIR_ENV];
  process.env[CACHE_DIR_ENV] = files.convertToOSPath(cacheRoot);
  try {
    return await fn(cacheRoot);
  } finally {
    if (saved === undefined) {
      delete process.env[CACHE_DIR_ENV];
    } else {
      process.env[CACHE_DIR_ENV] = saved;
    }
    await files.rm_recursive(cacheRoot).catch(() => {});
  }
}

selftest.define('prepared-app-cache roundtrip', async function () {
  await withTempCacheRoot(async (cacheRoot) => {
    // First sandbox warms the cache.
    const s1 = new Sandbox();
    await s1.init();
    await s1.createApp('app1', 'modern');

    const entries = files.readdirNoDots(cacheRoot);
    selftest.expectEqual(entries.length, 1);
    const [cacheKey] = entries;
    const cacheEntryDir = files.pathJoin(cacheRoot, cacheKey);
    selftest.expectTrue(
      files.exists(files.pathJoin(cacheEntryDir, READY_MARKER)),
    );

    // Second sandbox must read the same cache entry rather than re-running
    // --prepare-app. Capture the entry's mtime before, compare after.
    const beforeStat = files.statOrNull(
      files.pathJoin(cacheEntryDir, READY_MARKER),
    );

    const s2 = new Sandbox();
    await s2.init();
    await s2.createApp('app2', 'modern');

    const afterStat = files.statOrNull(
      files.pathJoin(cacheEntryDir, READY_MARKER),
    );
    selftest.expectEqual(afterStat?.mtimeMs, beforeStat?.mtimeMs);

    const app2Dir = files.pathJoin(s2.cwd, 'app2');
    const localDir = files.pathJoin(app2Dir, '.meteor', 'local');
    selftest.expectTrue(files.exists(localDir));

    // Cache marker files must not leak into the copied app.
    selftest.expectFalse(
      files.exists(files.pathJoin(app2Dir, READY_MARKER)),
    );
    selftest.expectFalse(
      files.exists(files.pathJoin(app2Dir, SENTINEL_PATH_FILE)),
    );

    // No copied isopack-buildinfo.json may still mention the warming
    // sentinel path — that would mean the path-rewriter missed a key and
    // the cached IsopackCache._checkUpToDate would fire on a stale path.
    const sentinelPath = files
      .readFile(files.pathJoin(cacheEntryDir, SENTINEL_PATH_FILE), 'utf8')
      .trim();
    const isopacksDir = files.pathJoin(localDir, 'isopacks');
    if (files.exists(isopacksDir)) {
      for (const pkg of files.readdirNoDots(isopacksDir)) {
        const buildInfoPath = files.pathJoin(
          isopacksDir, pkg, 'isopack-buildinfo.json',
        );
        if (!files.exists(buildInfoPath)) continue;
        const contents = files.readFile(buildInfoPath, 'utf8');
        selftest.expectFalse(contents.includes(sentinelPath));
        // And rewritten paths must point at app2.
        const app2Posix = files.convertToStandardPath(app2Dir);
        selftest.expectTrue(contents.includes(app2Posix));
      }
    }
  });
});
