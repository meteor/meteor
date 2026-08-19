// Regression coverage for the prepared-app snapshot used by Sandbox#createApp.
// The second sandbox has no executable tool path: it can succeed only by
// copying the valid snapshot warmed by the first sandbox.

const selftest = require('../tool-testing/selftest.js');
const Sandbox = selftest.Sandbox;
const files = require('../fs/files');
const {
  applyPreparedAppCacheEntry,
  getPreparedAppCacheEntry,
} = require('../tool-testing/prepared-app-cache.js');

const CACHE_DIR_ENV = 'METEOR_SELFTEST_PREPARED_APP_CACHE_DIR';
const READY_MARKER = '.meteor-selftest-cache-ready';
const METADATA_FILE = '.meteor-selftest-cache-metadata.json';
const SNAPSHOT_DIRECTORY = 'app';

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
    await selftest.expectEqual(
      metadata.producerToolsDir,
      files.realpath(files.getCurrentToolsDir()),
    );
    selftest.expectTrue(typeof metadata.sentinelPath === 'string');

    const beforeMarkerStat = files.statOrNull(markerPath);

    const secondSandbox = new Sandbox();
    await secondSandbox.init();
    secondSandbox.execPath = files.pathJoin(secondSandbox.root, 'missing-meteor');
    await secondSandbox.createApp('app2', 'modern');

    const afterMarkerStat = files.statOrNull(markerPath);
    await selftest.expectEqual(afterMarkerStat?.mtimeMs, beforeMarkerStat?.mtimeMs);

    // A process-level override can affect preparation, so it must not reuse
    // the standard snapshot created without that override.
    const savedModern = process.env.METEOR_MODERN;
    process.env.METEOR_MODERN = 'legacy';
    const modernOverrideSandbox = new Sandbox();
    await modernOverrideSandbox.init();
    modernOverrideSandbox.execPath = files.pathJoin(
      modernOverrideSandbox.root,
      'missing-meteor',
    );
    let modernOverrideDidThrow = false;
    try {
      await modernOverrideSandbox.createApp('app3', 'modern');
    } catch {
      modernOverrideDidThrow = true;
    } finally {
      if (savedModern === undefined) {
        delete process.env.METEOR_MODERN;
      } else {
        process.env.METEOR_MODERN = savedModern;
      }
    }
    selftest.expectTrue(modernOverrideDidThrow);

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

    const snapshotDir = files.pathJoin(cacheEntryDir, SNAPSHOT_DIRECTORY);
    const staleFile = files.pathJoin(
      snapshotDir,
      '.meteor',
      'local',
      'prepared-app-cache-stale.json',
    );
    files.writeFile(staleFile, metadata.sentinelPath, 'utf8');
    const staleDestRoot = files.mkdtemp('prepared-app-cache-stale-dest');
    const staleDest = files.pathJoin(staleDestRoot, 'app');
    let staleResult;
    try {
      staleResult = await applyPreparedAppCacheEntry({
        cacheEntry: { root: cacheRoot, cacheKey: entries[0] },
        destAppDir: staleDest,
        destRoot: staleDestRoot,
      });
    } catch {
      staleResult = 'threw';
    }
    await selftest.expectEqual(staleResult, false);
    selftest.expectFalse(files.exists(staleDest));
    await files.rm_recursive(staleDestRoot);
    files.unlink(staleFile);

    const unsafeTarget = files.pathJoin(cacheEntryDir, 'unsafe-target');
    const unsafeLink = files.pathJoin(snapshotDir, 'unsafe-link');
    files.writeFile(unsafeTarget, 'cache data must not contain symlinks', 'utf8');
    files.symlink('../unsafe-target', unsafeLink);
    const symlinkDestRoot = files.mkdtemp('prepared-app-cache-symlink-dest');
    const symlinkDest = files.pathJoin(symlinkDestRoot, 'app');
    const symlinkResult = await applyPreparedAppCacheEntry({
      cacheEntry: { root: cacheRoot, cacheKey: entries[0] },
      destAppDir: symlinkDest,
      destRoot: symlinkDestRoot,
    });
    await selftest.expectEqual(symlinkResult, false);
    selftest.expectFalse(files.exists(symlinkDest));
    await files.rm_recursive(symlinkDestRoot);
  });
});

selftest.define('prepared-app-cache rejects unsafe cache roots', async function () {
  await withTempCacheRoot(async (cacheRoot) => {
    files.chmod(cacheRoot, 0o777);
    try {
      const missingMeteor = files.pathJoin(cacheRoot, 'missing-meteor');
      let result;
      let didThrow = false;
      try {
        result = await getPreparedAppCacheEntry({
          template: 'modern',
          execPath: missingMeteor,
        });
      } catch {
        didThrow = true;
      }
      selftest.expectFalse(didThrow);
      await selftest.expectEqual(result, null);
    } finally {
      files.chmod(cacheRoot, 0o700);
    }
  });
});
