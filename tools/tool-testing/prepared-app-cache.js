// Cache for the output of `meteor --prepare-app`, shared across self-test
// sandboxes. Self-tests routinely call `Sandbox#createApp(name, template)`,
// each time spending 30-90s to rebuild the same template into a fresh
// `.meteor/local/`. This module warms a single prepared snapshot per
// (template, release, source-fingerprint) tuple and copies it into each
// sandbox, rewriting the absolute paths embedded in `isopack-buildinfo.json`
// so the per-isopack up-to-date check passes on the new path.
//
// The XXX caching note in `sandbox.js#createApp` (see git blame) flagged the
// difficulty as "isopack-buildinfo.json uses absolute paths". WatchSet entries
// inside that file fall into two classes:
//   - paths into the meteor checkout (stable across sandboxes — no rewrite)
//   - paths into the app dir (sandbox-specific — rewritten here)
// Internally meteor stores paths in POSIX form (see static-assets/mini-files),
// so we only handle forward-slash variants.

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

import * as files from '../fs/files';

const execFileAsync = promisify(execFile);

const READY_MARKER = '.meteor-selftest-cache-ready';
const SENTINEL_PATH_FILE = '.meteor-selftest-cache-sentinel-path';
const CACHE_DIR_ENV = 'METEOR_SELFTEST_PREPARED_APP_CACHE_DIR';
const DISABLE_ENV = 'METEOR_DISABLE_PREPARED_APP_CACHE';
const PREPARE_TIMEOUT_MS = 5 * 60 * 1000;

export const isDisabled = () => Boolean(process.env[DISABLE_ENV]);

function cacheRoot() {
  const fromEnv = process.env[CACHE_DIR_ENV];
  if (fromEnv) {
    return files.convertToStandardPath(fromEnv);
  }
  return files.pathJoin(
    files.convertToStandardPath(os.tmpdir()),
    'meteor-selftest-prepared-app-cache',
  );
}

// Hash committed-state and uncommitted edits under tools/ and packages/.
// In checkout mode this is the natural cache key for "the meteor source the
// build will see"; outside a checkout we fall back to a stat of the tools dir,
// which is correct for warehouse releases (release identity already pinned via
// the cache key tuple).
async function computeSourceFingerprint(toolsDir) {
  const hash = createHash('sha256');

  let head = '';
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: files.convertToOSPath(toolsDir),
    });
    head = stdout.trim();
  } catch {
    const stat = files.statOrNull(toolsDir);
    hash.update(`MTIME:${stat?.mtimeMs ?? 0}\n`);
    return hash.digest('hex').slice(0, 16);
  }
  hash.update(`HEAD:${head}\n`);

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain', '--', 'tools', 'packages'],
      { cwd: files.convertToOSPath(toolsDir), maxBuffer: 16 * 1024 * 1024 },
    );
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      // Porcelain format: 2 status chars, 1 space, then a (possibly quoted) path
      const relPath = line.slice(3).replace(/^"(.*)"$/, '$1');
      const absPath = files.pathJoin(toolsDir, relPath);
      const stat = files.statOrNull(absPath);
      if (stat?.isFile()) {
        hash.update(`${relPath}:${stat.size}:${stat.mtimeMs}\n`);
      } else {
        hash.update(`${relPath}:missing\n`);
      }
    }
  } catch {
    hash.update('PORCELAIN_FAILED\n');
  }

  return hash.digest('hex').slice(0, 16);
}

function computeTemplateFingerprint(templateAbsPath) {
  const hash = createHash('sha256');
  walk(templateAbsPath, (relPath, stat) => {
    hash.update(`${relPath}:${stat.size}:${stat.mtimeMs}\n`);
  });
  return hash.digest('hex').slice(0, 16);
}

function walk(rootAbsPath, visit) {
  const stack = [''];
  while (stack.length > 0) {
    const rel = stack.pop();
    const abs = rel ? files.pathJoin(rootAbsPath, rel) : rootAbsPath;
    const stat = files.statOrNull(abs);
    if (!stat) continue;
    if (stat.isDirectory()) {
      for (const entry of files.readdirNoDots(abs)) {
        stack.push(rel ? `${rel}/${entry}` : entry);
      }
    } else if (stat.isFile()) {
      visit(rel, stat);
    }
  }
}

// Replace fromPrefix with toPrefix when it sits at the start of `p`. Both
// prefixes are absolute POSIX paths. We do not attempt substring matches in
// the middle of strings, since WatchSet entries are full absolute paths.
function swapPathPrefix(p, fromPrefix, toPrefix) {
  if (typeof p !== 'string') return p;
  if (p === fromPrefix) return toPrefix;
  if (p.startsWith(fromPrefix + '/')) {
    return toPrefix + p.slice(fromPrefix.length);
  }
  return p;
}

// Recursively replace `fromPrefix` with `toPrefix` in every string value and
// object key. Required because isopack-buildinfo.json buries absolute paths
// in many shapes — WatchSet (files keyed by absPath, directories[].absPath),
// pluginProviderPackageMap[pkg].sourceRoot, and any other key meteor's build
// system may add later. A generic walk is safer than enumerating each shape.
function deepRewriteStrings(value, fromPrefix, toPrefix) {
  if (typeof value === 'string') {
    return swapPathPrefix(value, fromPrefix, toPrefix);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = deepRewriteStrings(value[i], fromPrefix, toPrefix);
    }
    return value;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[swapPathPrefix(k, fromPrefix, toPrefix)] =
        deepRewriteStrings(v, fromPrefix, toPrefix);
    }
    return out;
  }
  return value;
}

function rewriteIsopackBuildInfo(buildInfoPath, fromPrefix, toPrefix) {
  const json = files.readJSONOrNull(buildInfoPath);
  if (!json) return;
  const rewritten = deepRewriteStrings(json, fromPrefix, toPrefix);
  files.writeFile(buildInfoPath, JSON.stringify(rewritten) + '\n', 'utf8');
}

// Belt-and-suspenders: walk the freshly-copied .meteor/local and assert no
// path string still references the warming sentinel. If something does, the
// rewriter missed a path-bearing file and we'd silently get a stale cache;
// fail loud instead. Skipped extensions are large binary blobs that cannot
// reasonably contain absolute paths (compiled archives, mongo data files).
const SKIP_GUARD_EXTENSIONS = new Set(['.wt', '.wiredtiger', '.bson']);

function assertNoResidualSentinel(localDir, sentinelPath) {
  const offenders = [];
  walk(localDir, (relPath) => {
    const lastDot = relPath.lastIndexOf('.');
    const ext = lastDot >= 0 ? relPath.slice(lastDot).toLowerCase() : '';
    if (SKIP_GUARD_EXTENSIONS.has(ext)) return;
    const abs = files.pathJoin(localDir, relPath);
    const stat = files.statOrNull(abs);
    if (!stat || stat.size === 0 || stat.size > 64 * 1024 * 1024) return;
    let contents;
    try {
      contents = files.readFile(abs, 'utf8');
    } catch {
      return; // unreadable as utf8, skip
    }
    if (contents.includes(sentinelPath)) {
      offenders.push(relPath);
    }
  });
  if (offenders.length > 0) {
    throw new Error(
      `prepared-app-cache: residual sentinel path "${sentinelPath}" found ` +
      `in copied .meteor/local files after rewrite: ${offenders.slice(0, 10).join(', ')}` +
      (offenders.length > 10 ? ` (and ${offenders.length - 10} more)` : '') +
      '. The path-rewriter needs to handle these files or the cache must be ' +
      `disabled via ${DISABLE_ENV}=1.`,
    );
  }
}

// plugin-cache/<plugin>/local/<sha>.json holds compiler output keyed by the
// app's absolute source paths. Larger templates (modern.js exercises swc/
// ecmascript across many files) can produce dozens of these per plugin.
// Empty or malformed entries are skipped — they can't carry paths and
// readJSONOrNull only swallows ENOENT.
function rewritePluginCache(localDir, fromPrefix, toPrefix) {
  const pluginCacheDir = files.pathJoin(localDir, 'plugin-cache');
  if (!files.exists(pluginCacheDir)) return;
  for (const plugin of files.readdirNoDots(pluginCacheDir)) {
    const pluginLocalDir = files.pathJoin(pluginCacheDir, plugin, 'local');
    if (!files.exists(pluginLocalDir)) continue;
    for (const entry of files.readdirNoDots(pluginLocalDir)) {
      if (!entry.endsWith('.json')) continue;
      const filePath = files.pathJoin(pluginLocalDir, entry);
      let json;
      try {
        const raw = files.readFile(filePath, 'utf8');
        if (!raw.trim()) continue;
        json = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!json) continue;
      const rewritten = deepRewriteStrings(json, fromPrefix, toPrefix);
      files.writeFile(filePath, JSON.stringify(rewritten) + '\n', 'utf8');
    }
  }
}

async function rewritePaths(targetAppDir, sentinelPath, finalAppPath) {
  const localDir = files.pathJoin(targetAppDir, '.meteor', 'local');
  if (!files.exists(localDir)) return;

  const isopacksDir = files.pathJoin(localDir, 'isopacks');
  if (files.exists(isopacksDir)) {
    for (const pkgName of files.readdirNoDots(isopacksDir)) {
      const buildInfoPath = files.pathJoin(isopacksDir, pkgName, 'isopack-buildinfo.json');
      if (files.exists(buildInfoPath)) {
        rewriteIsopackBuildInfo(buildInfoPath, sentinelPath, finalAppPath);
      }
    }
  }

  rewritePluginCache(localDir, sentinelPath, finalAppPath);

  assertNoResidualSentinel(localDir, sentinelPath);
}

async function runMeteorPrepareApp({ execPath, cwd, env }) {
  await execFileAsync(files.convertToOSPath(execPath), ['--prepare-app'], {
    cwd: files.convertToOSPath(cwd),
    env: { ...process.env, ...env },
    timeout: PREPARE_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
}

// Atomic-ish warming: stage to a tmp dir under the cache root, then rename
// into place. If the rename target already exists (race with another caller),
// drop our stage and use the winner's snapshot. The staging sequence mirrors
// `Sandbox#createApp`: copy template, pin release, pin upgraders, install npm
// deps, then run `--prepare-app`. Anything inline-private to that flow lives
// here so the cached snapshot is a drop-in for the uncached path.
async function warmCache({
  cacheDir, templateAbsPath, releaseName, upgradersToAppend,
  execPath, env,
}) {
  const root = files.pathDirname(cacheDir);
  files.mkdir_p(root);
  const stagingDir = files.pathJoin(
    root,
    `staging-${process.pid}-${Date.now().toString(36)}`,
  );

  await files.cp_r(templateAbsPath, stagingDir, {
    ignore: [/^local$/],
    preserveSymlinks: true,
  });

  if (releaseName) {
    const releasePath = files.pathJoin(stagingDir, '.meteor', 'release');
    files.mkdir_p(files.pathDirname(releasePath));
    files.writeFile(releasePath, releaseName, 'utf8');
  }

  const { FinishedUpgraders } = require('../project-context.js');
  const upgradersFile = new FinishedUpgraders({ projectDir: stagingDir });
  if (upgradersFile.readUpgraders().length === 0 && upgradersToAppend?.length) {
    upgradersFile.appendUpgraders(upgradersToAppend);
  }

  await require('../cli/default-npm-deps.js').install(stagingDir);

  files.writeFile(
    files.pathJoin(stagingDir, SENTINEL_PATH_FILE),
    stagingDir,
    'utf8',
  );

  await runMeteorPrepareApp({ execPath, cwd: stagingDir, env });
  files.writeFile(files.pathJoin(stagingDir, READY_MARKER), '', 'utf8');

  try {
    await files.rename(stagingDir, cacheDir);
  } catch (err) {
    if (files.exists(files.pathJoin(cacheDir, READY_MARKER))) {
      // Another caller won the race — drop our work and use theirs.
      await files.rm_recursive(stagingDir).catch(() => {});
      return;
    }
    throw err;
  }
}

// Given a template name (e.g., "modern"), return an app dir prepared to be
// copied into a sandbox. Returns null when caching is disabled, when not
// running from a checkout, or when the template doesn't exist; callers must
// treat null as "do the prepare yourself". `releaseName` is what gets pinned
// into `.meteor/release` (typically `releaseCurrent.name`); the cache key
// derives from source fingerprint + template fingerprint so a release bump
// invalidates automatically.
export async function getPreparedAppCacheEntry({
  template, releaseName = null, upgradersToAppend = [],
  execPath, env = {},
}) {
  if (isDisabled()) return null;
  if (!files.inCheckout()) return null;

  const toolsDir = files.getCurrentToolsDir();
  const templateAbsPath = files.pathJoin(
    toolsDir, 'tools', 'tests', 'apps', template,
  );
  if (!files.exists(templateAbsPath)) return null;

  const sourceFp = await computeSourceFingerprint(toolsDir);
  const templateFp = computeTemplateFingerprint(templateAbsPath);
  const cacheKey = createHash('sha256')
    .update(JSON.stringify({
      v: 1,
      sourceFp,
      templateFp,
      template,
      releaseName: releaseName ?? 'none',
    }))
    .digest('hex')
    .slice(0, 24);

  const root = cacheRoot();
  const cacheDir = files.pathJoin(root, cacheKey);
  const readyMarker = files.pathJoin(cacheDir, READY_MARKER);

  if (!files.exists(readyMarker)) {
    await warmCache({
      cacheDir, templateAbsPath, releaseName, upgradersToAppend,
      execPath, env,
    });
  }

  const sentinelPath = files.readFile(
    files.pathJoin(cacheDir, SENTINEL_PATH_FILE),
    'utf8',
  ).trim();

  return { cacheDir, sentinelPath };
}

// Copy a prepared snapshot into the destination app dir and rewrite all
// embedded absolute paths to point at the destination.
//
// We don't use cp_r's `ignore` option to filter out the cache markers: that
// option short-circuits the whole copy on a match (cp_r in fs/files.ts uses
// `return` rather than `continue` when a pattern matches), so an ignored
// entry encountered mid-readdir would silently stop the copy. Strip the
// markers post-copy instead — both files live at the snapshot root, so the
// cleanup is bounded.
export async function applyPreparedAppCacheEntry({
  cacheEntry, destAppDir,
}) {
  const { cacheDir, sentinelPath } = cacheEntry;
  await files.cp_r(cacheDir, destAppDir, { preserveSymlinks: true });
  for (const marker of [READY_MARKER, SENTINEL_PATH_FILE]) {
    const path = files.pathJoin(destAppDir, marker);
    if (files.exists(path)) {
      files.unlink(path);
    }
  }
  await rewritePaths(destAppDir, sentinelPath, destAppDir);
}
