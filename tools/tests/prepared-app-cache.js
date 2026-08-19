// Regression coverage for the prepared-app snapshot used by Sandbox#createApp.
// The second sandbox has no executable tool path: it can succeed only by
// copying the valid snapshot warmed by the first sandbox.

const selftest = require('../tool-testing/selftest.js');
const Sandbox = selftest.Sandbox;
const files = require('../fs/files');

const CACHE_DIR_ENV = 'METEOR_SELFTEST_PREPARED_APP_CACHE_DIR';
const READY_MARKER = '.meteor-selftest-cache-ready';
const METADATA_FILE = '.meteor-selftest-cache-metadata.json';

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
    const firstSandbox = new Sandbox();
    await firstSandbox.init();
    await firstSandbox.createApp('app1', 'modern');

    const entries = files.readdirNoDots(cacheRoot);
    await selftest.expectEqual(entries.length, 1);
    const cacheEntryDir = files.pathJoin(cacheRoot, entries[0]);
    const markerPath = files.pathJoin(cacheEntryDir, READY_MARKER);
    const metadataPath = files.pathJoin(cacheEntryDir, METADATA_FILE);
    selftest.expectTrue(files.exists(markerPath));
    selftest.expectTrue(files.exists(metadataPath));

    const metadata = JSON.parse(files.readFile(metadataPath, 'utf8'));
    await selftest.expectEqual(metadata.version, 1);
    await selftest.expectEqual(metadata.cacheKey, entries[0]);
    selftest.expectTrue(typeof metadata.sentinelPath === 'string');

    const beforeMarkerStat = files.statOrNull(markerPath);

    const secondSandbox = new Sandbox();
    await secondSandbox.init();
    secondSandbox.execPath = files.pathJoin(secondSandbox.root, 'missing-meteor');
    await secondSandbox.createApp('app2', 'modern');

    const afterMarkerStat = files.statOrNull(markerPath);
    await selftest.expectEqual(afterMarkerStat?.mtimeMs, beforeMarkerStat?.mtimeMs);

    // A sandbox-specific environment can affect preparation, so it must take
    // the uncached path rather than reuse the standard snapshot.
    const customEnvSandbox = new Sandbox();
    await customEnvSandbox.init();
    customEnvSandbox.set('METEOR_SELFTEST_CACHE_REGRESSION', '1');
    customEnvSandbox.execPath = files.pathJoin(
      customEnvSandbox.root,
      'missing-meteor',
    );
    let customEnvCreateDidThrow = false;
    try {
      await customEnvSandbox.createApp('app3', 'modern');
    } catch {
      customEnvCreateDidThrow = true;
    }
    selftest.expectTrue(customEnvCreateDidThrow);

    const app2Dir = files.pathJoin(secondSandbox.cwd, 'app2');
    const localDir = files.pathJoin(app2Dir, '.meteor', 'local');
    selftest.expectTrue(files.exists(localDir));
    selftest.expectFalse(files.exists(files.pathJoin(app2Dir, READY_MARKER)));
    selftest.expectFalse(files.exists(files.pathJoin(app2Dir, METADATA_FILE)));

    const isopacksDir = files.pathJoin(localDir, 'isopacks');
    if (files.exists(isopacksDir)) {
      for (const pkg of files.readdirNoDots(isopacksDir)) {
        const buildInfoPath = files.pathJoin(
          isopacksDir, pkg, 'isopack-buildinfo.json',
        );
        if (!files.exists(buildInfoPath)) continue;
        const contents = files.readFile(buildInfoPath, 'utf8');
        selftest.expectFalse(contents.includes(metadata.sentinelPath));
      }
    }
  });
});
