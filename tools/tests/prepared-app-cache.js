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

function snapshotHasNoSymlinks(root) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    const stat = files.lstat(current);
    if (stat.isSymbolicLink()) return false;
    if (stat.isDirectory()) {
      for (const entry of files.readdir(current)) {
        pending.push(files.pathJoin(current, entry));
      }
    }
  }
  return true;
}

selftest.define('prepared-app-cache roundtrip', async function () {
  const savedNodeEnv = process.env.NODE_ENV;
  if (savedNodeEnv === undefined) process.env.NODE_ENV = 'development';
  try {
    await withTempCacheRoot(async (cacheRoot) => {
      const firstSandbox = new Sandbox();
      await firstSandbox.init();
      await firstSandbox.createApp('app1', 'standard-app');
      const entries = files.readdirNoDots(cacheRoot);
      await selftest.expectEqual(entries.length, 1);
      const cacheEntryDir = files.pathJoin(cacheRoot, entries[0]);
      const markerPath = files.pathJoin(cacheEntryDir, READY_MARKER);
      const metadataPath = files.pathJoin(cacheEntryDir, METADATA_FILE);
      selftest.expectTrue(files.exists(markerPath));
      selftest.expectTrue(files.exists(metadataPath));

      const metadata = JSON.parse(files.readFile(metadataPath, 'utf8'));
      await selftest.expectEqual(metadata.version, 3);
      await selftest.expectEqual(metadata.cacheKey, entries[0]);
      await selftest.expectEqual(
        metadata.producerToolsDir,
        files.realpath(files.getCurrentToolsDir()),
      );
      selftest.expectTrue(typeof metadata.environmentFingerprint === 'string');
      selftest.expectTrue(typeof metadata.sentinelPath === 'string');

      const snapshotDir = files.pathJoin(cacheEntryDir, SNAPSHOT_DIRECTORY);
      selftest.expectTrue(snapshotHasNoSymlinks(snapshotDir));

      const secondSandbox = new Sandbox();
      await secondSandbox.init();
      secondSandbox.execPath = files.pathJoin(secondSandbox.root, 'missing-meteor');
      await secondSandbox.createApp('app2', 'standard-app');
      const cacheEnv = secondSandbox._makeEnv();
      const activeCacheEntry = await getPreparedAppCacheEntry({
        template: 'standard-app',
        execPath: secondSandbox.execPath,
        env: cacheEnv,
      });
      selftest.expectTrue(Boolean(activeCacheEntry));
      const activeMetadata = JSON.parse(files.readFile(
        files.pathJoin(activeCacheEntry.root, activeCacheEntry.cacheKey, METADATA_FILE),
        'utf8',
      ));
      const activeSnapshotDir = files.pathJoin(
        activeCacheEntry.root,
        activeCacheEntry.cacheKey,
        SNAPSHOT_DIRECTORY,
      );

      // A process-level override can affect preparation. It must create a
      // separate cache partition, which a later sandbox can then reuse.
      const savedModern = process.env.METEOR_MODERN;
      process.env.METEOR_MODERN = savedModern === 'true' ? 'false' : 'true';
      const modernOverrideSandbox = new Sandbox();
      await modernOverrideSandbox.init();
      try {
        const entriesBeforeModernOverride = files.readdirNoDots(cacheRoot).length;
        await modernOverrideSandbox.createApp('app4', 'standard-app');
        const entriesWithModernOverride = files.readdirNoDots(cacheRoot);
        selftest.expectTrue(entriesWithModernOverride.length > entriesBeforeModernOverride);

        const modernReuseSandbox = new Sandbox();
        await modernReuseSandbox.init();
        modernReuseSandbox.execPath = files.pathJoin(
          modernReuseSandbox.root,
          'missing-meteor',
        );
        await modernReuseSandbox.createApp('app5', 'standard-app');
      } finally {
        if (savedModern === undefined) {
          delete process.env.METEOR_MODERN;
        } else {
          process.env.METEOR_MODERN = savedModern;
        }
      }

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
          selftest.expectFalse(contents.includes(activeMetadata.sentinelPath));
        }
      }

      const staleFile = files.pathJoin(
        activeSnapshotDir,
        '.meteor',
        'local',
        'prepared-app-cache-stale.json',
      );
      files.writeFile(staleFile, activeMetadata.sentinelPath, 'utf8');
      const staleDestRoot = files.mkdtemp('prepared-app-cache-stale-dest');
      const staleDest = files.pathJoin(staleDestRoot, 'app');
      let staleResult;
      try {
        staleResult = await applyPreparedAppCacheEntry({
          cacheEntry: activeCacheEntry,
          destAppDir: staleDest,
          destRoot: staleDestRoot,
          env: cacheEnv,
        });
      } catch {
        staleResult = 'threw';
      }
      await selftest.expectEqual(staleResult, false);
      selftest.expectFalse(files.exists(staleDest));
      await files.rm_recursive(staleDestRoot);
      files.unlink(staleFile);

      const outsideDestRoot = files.mkdtemp('prepared-app-cache-outside-dest');
      const symlinkedDestRoot = files.mkdtemp('prepared-app-cache-symlinked-dest');
      const symlinkedDest = files.pathJoin(symlinkedDestRoot, 'link', 'app');
      files.symlink(outsideDestRoot, files.pathJoin(symlinkedDestRoot, 'link'));
      const symlinkedDestResult = await applyPreparedAppCacheEntry({
        cacheEntry: activeCacheEntry,
        destAppDir: symlinkedDest,
        destRoot: symlinkedDestRoot,
        env: cacheEnv,
      });
      await selftest.expectEqual(symlinkedDestResult, false);
      selftest.expectFalse(files.exists(files.pathJoin(outsideDestRoot, 'app')));
      await files.rm_recursive(symlinkedDestRoot);
      await files.rm_recursive(outsideDestRoot);

      const unsafeTarget = files.pathJoin(
        activeCacheEntry.root, activeCacheEntry.cacheKey, 'unsafe-target',
      );
      const unsafeLink = files.pathJoin(activeSnapshotDir, 'unsafe-link');
      files.writeFile(unsafeTarget, 'cache data must not contain symlinks', 'utf8');
      files.symlink('../unsafe-target', unsafeLink);
      const symlinkDestRoot = files.mkdtemp('prepared-app-cache-symlink-dest');
      const symlinkDest = files.pathJoin(symlinkDestRoot, 'app');
      const symlinkResult = await applyPreparedAppCacheEntry({
        cacheEntry: activeCacheEntry,
        destAppDir: symlinkDest,
        destRoot: symlinkDestRoot,
        env: cacheEnv,
      });
      await selftest.expectEqual(symlinkResult, false);
      selftest.expectFalse(files.exists(symlinkDest));
      await files.rm_recursive(symlinkDestRoot);
    });
  } finally {
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
  }
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
          template: 'standard-app',
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

selftest.define('prepared-app-cache bypasses local file dependency templates', async function () {
  await withTempCacheRoot(async (cacheRoot) => {
    const result = await getPreparedAppCacheEntry({
      template: 'modern',
      execPath: files.pathJoin(cacheRoot, 'missing-meteor'),
    });
    await selftest.expectEqual(result, null);
    await selftest.expectEqual(files.readdirNoDots(cacheRoot).length, 0);
  });
});
