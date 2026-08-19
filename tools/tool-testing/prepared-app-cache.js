// A process-local cache for the result of `meteor --prepare-app` in tool
// self-tests. The cache belongs below the operating system's temporary
// directory and is intentionally not persisted or restored by CI.

import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

import * as files from '../fs/files';
import { FinishedUpgraders } from '../project-context.js';
import * as defaultNpmDeps from '../cli/default-npm-deps.js';

const execFileAsync = promisify(execFile);

const CACHE_DIRECTORY_NAME = 'meteor-selftest-prepared-app-cache';
const CACHE_DIR_ENV = 'METEOR_SELFTEST_PREPARED_APP_CACHE_DIR';
const DISABLE_ENV = 'METEOR_DISABLE_PREPARED_APP_CACHE';
const READY_MARKER = '.meteor-selftest-cache-ready';
const METADATA_FILE = '.meteor-selftest-cache-metadata.json';
const SNAPSHOT_DIRECTORY = 'app';
const CACHE_FORMAT_VERSION = 3;
const PREPARE_TIMEOUT_MS = 15 * 60 * 1000;
const STALE_ENTRY_LEASE_MS = PREPARE_TIMEOUT_MS + 5 * 60 * 1000;
const SOURCE_FINGERPRINT_MAX_BYTES = 16 * 1024 * 1024;
const STAGING_NAME_RE = /^\.staging-[0-9]+-[a-f0-9]{32}$/;
const CACHE_KEY_RE = /^[a-f0-9]{24}$/;
const QUARANTINE_NAME_RE = /^\.quarantine-[a-f0-9]{24}-[0-9]+-[a-f0-9]{32}$/;
const SKIP_GUARD_EXTENSIONS = new Set(['.wt', '.wiredtiger', '.bson']);
const PREPARE_ENV_NAMES = new Set([
  'BABEL_ENV',
  'METEOR_DEBUG_BUILD',
  'METEOR_DISABLE_OPTIMISTIC_CACHING',
  'METEOR_FORCE_EXCLUDE_ARCHS',
  'METEOR_FORCE_INCLUDE_ARCHS',
  'METEOR_LOCAL_DIR',
  'METEOR_MODERN',
  'METEOR_NPM_REBUILD_FLAGS',
  'METEOR_NO_RELEASE_CHECK',
  'METEOR_OFFLINE_CATALOG',
  'METEOR_PACKAGE_DIRS',
  'METEOR_PACKAGE_SERVER_URL',
  'METEOR_PROFILE',
  'METEOR_REIFY_CACHE_DIR',
  'METEOR_SKIP_NPM_REBUILD',
  'METEOR_TOOL_ENABLE_REIFY_RUNTIME_CACHE',
  'NODE_ENV',
  'NODE_OPTIONS',
  'SELF_TEST_TOOL_NODE_FLAGS',
  'TOOL_NODE_FLAGS',
]);

export const isDisabled = () => Boolean(process.env[DISABLE_ENV]);

// Preparation is affected by these deterministic inputs. `NPM_CONFIG_*`
// options cover npm install/rebuild behavior. Harness output such as
// TEST_METADATA and the sandbox-specific METEOR_SESSION_FILE are deliberately
// excluded. Keep values out of metadata and logs: this digest is only a cache
// partition key.
function computeEnvironmentFingerprint(env) {
  if (!env || typeof env !== 'object') return null;
  const effective = new Map();
  for (const [name, value] of Object.entries(process.env)) {
    if ((PREPARE_ENV_NAMES.has(name) ||
         name.toUpperCase().startsWith('NPM_CONFIG_')) && value !== undefined) {
      effective.set(name, String(value));
    }
  }
  for (const [name, value] of Object.entries(env)) {
    if (!PREPARE_ENV_NAMES.has(name) &&
        !name.toUpperCase().startsWith('NPM_CONFIG_')) continue;
    if (value === undefined) {
      effective.delete(name);
    } else {
      effective.set(name, String(value));
    }
  }

  const hash = createHash('sha256');
  for (const [name, value] of [...effective.entries()].sort(([a], [b]) =>
    a.localeCompare(b))) {
    hash.update(`${name.length}:${name}${value.length}:${value}\0`);
  }
  return hash.digest('hex').slice(0, 24);
}

function lstatOrNull(path) {
  try {
    return files.lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
}

function isDirectory(path) {
  const stat = lstatOrNull(path);
  return Boolean(stat?.isDirectory() && !stat.isSymbolicLink());
}

function isRegularFile(path) {
  const stat = lstatOrNull(path);
  return Boolean(stat?.isFile() && !stat.isSymbolicLink());
}

function isPrivateDirectory(path) {
  const stat = lstatOrNull(path);
  if (!stat?.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    return false;
  }
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

function isContainedPath(parent, child) {
  return files.containsPath(parent, child);
}

function isDirectChild(parent, child, namePattern) {
  return isContainedPath(parent, child) &&
    files.pathDirname(child) === parent &&
    namePattern.test(files.pathBasename(child));
}

function resolveAbsolutePath(value) {
  if (typeof value !== 'string' || value.includes('\0')) {
    return null;
  }
  const standardPath = files.convertToStandardPath(value);
  if (!files.pathIsAbsolute(standardPath)) {
    return null;
  }
  return files.pathResolve(standardPath);
}

function userCacheNamespace() {
  let identity = 'unknown';
  try {
    identity = os.userInfo().username || identity;
  } catch {
    if (typeof process.getuid === 'function') {
      identity = String(process.getuid());
    }
  }
  return `user-${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

// Descend from a canonical temporary directory one component at a time. This
// prevents the optional test hook from creating a cache through a symlink that
// points outside the temporary-directory boundary.
function makeCacheRoot() {
  const tempRoot = files.realpath(
    files.pathResolve(files.convertToStandardPath(os.tmpdir())),
  );
  const configuredRoot = process.env[CACHE_DIR_ENV]
    ? resolveAbsolutePath(process.env[CACHE_DIR_ENV])
    : files.pathJoin(tempRoot, CACHE_DIRECTORY_NAME, userCacheNamespace());

  if (!configuredRoot || !isContainedPath(tempRoot, configuredRoot)) {
    return null;
  }

  const relativeRoot = files.pathRelative(tempRoot, configuredRoot);
  const parts = relativeRoot ? relativeRoot.split('/') : [];
  if (parts.length === 0) {
    return null;
  }
  let current = tempRoot;
  for (const part of parts) {
    if (!part || part === '.' || part === '..') {
      return null;
    }
    const next = files.pathJoin(current, part);
    const stat = lstatOrNull(next);
    if (stat) {
      if (!isPrivateDirectory(next)) {
        return null;
      }
    } else {
      try {
        files.mkdir(next, 0o700);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
      if (!isPrivateDirectory(next)) {
        return null;
      }
    }
    current = next;
  }

  const realRoot = files.realpath(current);
  return isContainedPath(tempRoot, realRoot) && isPrivateDirectory(realRoot)
    ? realRoot
    : null;
}

function safelyWalk(root, visit, shouldSkip = () => false) {
  const pending = [''];
  while (pending.length > 0) {
    const relativePath = pending.pop();
    const absolutePath = relativePath
      ? files.pathJoin(root, relativePath)
      : root;
    const stat = lstatOrNull(absolutePath);
    if (!stat || stat.isSymbolicLink() || shouldSkip(relativePath, stat)) {
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of files.readdir(absolutePath)) {
        pending.push(relativePath
          ? files.pathJoin(relativePath, entry)
          : entry);
      }
    } else if (stat.isFile()) {
      visit(relativePath, absolutePath, stat);
    }
  }
}

function snapshotIsSafe(snapshotDir) {
  const pending = [''];
  while (pending.length > 0) {
    const relativePath = pending.pop();
    const absolutePath = relativePath
      ? files.pathJoin(snapshotDir, relativePath)
      : snapshotDir;
    const stat = lstatOrNull(absolutePath);
    if (!stat || stat.isSymbolicLink()) return false;
    if (stat.isDirectory()) {
      for (const entry of files.readdir(absolutePath)) {
        pending.push(relativePath
          ? files.pathJoin(relativePath, entry)
          : entry);
      }
    } else if (!stat.isFile()) {
      return false;
    }
  }
  return true;
}

// `npm install` commonly creates .bin symlinks. Cache snapshots deliberately
// forbid symlinks, so materialize only links that resolve inside the private
// preparation directory or the producer checkout. This prevents a snapshot
// from capturing arbitrary files reached through a link, and
// `activeDirectories` rejects link cycles.
function materializeSnapshot(sourceRoot, destinationRoot, allowedRoots) {
  const canonicalSourceRoot = files.realpath(sourceRoot);
  if (!isDirectory(canonicalSourceRoot)) {
    throw new Error('prepared-app-cache source snapshot is not a directory');
  }
  const canonicalAllowedRoots = allowedRoots.map(root => files.realpath(root));
  const isAllowedSourcePath = sourcePath =>
    canonicalAllowedRoots.some(root => isContainedPath(root, sourcePath));

  const activeDirectories = new Set();
  const copyEntry = (sourcePath, destinationPath) => {
    let resolvedSource = sourcePath;
    let stat = lstatOrNull(sourcePath);
    if (!stat) {
      throw new Error('prepared-app-cache source snapshot entry disappeared');
    }
    if (stat.isSymbolicLink()) {
      const linkTarget = files.readlink(sourcePath);
      const unresolvedTarget = files.pathResolve(
        files.pathDirname(sourcePath),
        linkTarget,
      );
      if (!isAllowedSourcePath(unresolvedTarget)) {
        throw new Error(
          `prepared-app-cache source snapshot link escapes allowed roots: ${
            sourcePath} -> ${linkTarget}`,
        );
      }
      try {
        resolvedSource = files.realpath(sourcePath);
      } catch (error) {
        throw new Error(
          `prepared-app-cache source snapshot has a broken link: ${
            linkTarget} (${error?.code || 'unknown'})`,
        );
      }
      if (!isAllowedSourcePath(resolvedSource)) {
        throw new Error(
          `prepared-app-cache source snapshot link escapes allowed roots: ${
            sourcePath} -> ${resolvedSource}`,
        );
      }
      stat = lstatOrNull(resolvedSource);
      if (!stat || stat.isSymbolicLink()) {
        throw new Error('prepared-app-cache source snapshot link is invalid');
      }
    }

    if (stat.isDirectory()) {
      const canonicalDirectory = files.realpath(resolvedSource);
      if (!isAllowedSourcePath(canonicalDirectory) ||
          activeDirectories.has(canonicalDirectory)) {
        throw new Error('prepared-app-cache source snapshot has a directory cycle');
      }
      activeDirectories.add(canonicalDirectory);
      try {
        files.mkdir_p(destinationPath, 0o700);
        for (const entry of files.readdir(resolvedSource)) {
          copyEntry(
            files.pathJoin(resolvedSource, entry),
            files.pathJoin(destinationPath, entry),
          );
        }
      } finally {
        activeDirectories.delete(canonicalDirectory);
      }
      return;
    }

    if (!stat.isFile()) {
      throw new Error('prepared-app-cache source snapshot has an unsupported entry');
    }
    files.copyFile(resolvedSource, destinationPath);
  };

  copyEntry(canonicalSourceRoot, destinationRoot);
}

// Preparation invokes the checkout launcher and can consume repository-root
// inputs, so dirty tracked and untracked state is scoped to the whole checkout.
// Refuse caching rather than use a coarse fingerprint when it cannot be read
// within bounded memory.
async function computeSourceFingerprint(toolsDir) {
  const hash = createHash('sha256');
  try {
    const { stdout: head } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: files.convertToOSPath(toolsDir),
    });
    hash.update(`HEAD:${head.trim()}\n`);

    const { stdout: diff } = await execFileAsync(
      'git',
      ['diff', '--binary', '--no-ext-diff', '--no-renames', 'HEAD'],
      { cwd: files.convertToOSPath(toolsDir), maxBuffer: SOURCE_FINGERPRINT_MAX_BYTES },
    );
    hash.update(diff);

    const { stdout: untracked } = await execFileAsync(
      'git',
      ['ls-files', '--others', '--exclude-standard', '-z'],
      { cwd: files.convertToOSPath(toolsDir), maxBuffer: SOURCE_FINGERPRINT_MAX_BYTES },
    );
    for (const relativePath of untracked.split('\0')) {
      if (!relativePath) continue;
      const absolutePath = files.pathResolve(toolsDir, relativePath);
      const stat = lstatOrNull(absolutePath);
      if (!isContainedPath(toolsDir, absolutePath) || !stat?.isFile() ||
          stat.isSymbolicLink() || stat.size > SOURCE_FINGERPRINT_MAX_BYTES) {
        return null;
      }
      hash.update(`${relativePath}\0`);
      hash.update(files.readFile(absolutePath));
    }
  } catch {
    return null;
  }
  return hash.digest('hex').slice(0, 16);
}

function computeTemplateFingerprint(templatePath) {
  const hash = createHash('sha256');
  safelyWalk(templatePath, (relativePath, absolutePath, stat) => {
    hash.update(`${relativePath}:${stat.size}:${stat.mtimeMs}:`);
    hash.update(files.readFile(absolutePath));
    hash.update('\n');
  }, relativePath => relativePath === '.meteor/local');
  return hash.digest('hex').slice(0, 16);
}

// A local file dependency is represented by npm as a symlink. Some tests
// intentionally create its target after createApp (for example modern's
// config-package), so a snapshot without symlinks cannot preserve its meaning.
// Bypass the cache for every local file dependency rather than weaken that
// snapshot boundary.
function templateAllowsCache(templatePath) {
  const manifestPath = files.pathJoin(templatePath, 'package.json');
  if (!isRegularFile(manifestPath)) return true;
  let manifest;
  try {
    manifest = JSON.parse(files.readFile(manifestPath, 'utf8'));
  } catch {
    return false;
  }
  return ![
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
  ].some(dependencies => dependencies && typeof dependencies === 'object' &&
    Object.values(dependencies).some(specifier =>
      typeof specifier === 'string' && specifier.startsWith('file:')));
}

function swapPathPrefix(value, fromPrefix, toPrefix) {
  if (typeof value !== 'string') return value;
  if (value === fromPrefix) return toPrefix;
  return value.startsWith(`${fromPrefix}/`)
    ? `${toPrefix}${value.slice(fromPrefix.length)}`
    : value;
}

function rewriteStrings(value, fromPrefix, toPrefix) {
  if (typeof value === 'string') {
    return swapPathPrefix(value, fromPrefix, toPrefix);
  }
  if (Array.isArray(value)) {
    return value.map(item => rewriteStrings(item, fromPrefix, toPrefix));
  }
  if (value && typeof value === 'object') {
    const result = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(result, swapPathPrefix(key, fromPrefix, toPrefix), {
        value: rewriteStrings(item, fromPrefix, toPrefix),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  }
  return value;
}

function rewriteJsonFile(path, pathRewrites) {
  if (!isRegularFile(path)) return;
  let json;
  try {
    json = JSON.parse(files.readFile(path, 'utf8'));
  } catch {
    return;
  }
  for (const { fromPrefix, toPrefix } of pathRewrites) {
    json = rewriteStrings(json, fromPrefix, toPrefix);
  }
  files.writeFile(path, `${JSON.stringify(json)}\n`, 'utf8');
}

function rewriteCachedPaths(destinationAppDir, pathRewrites) {
  const localDir = files.pathJoin(destinationAppDir, '.meteor', 'local');
  if (!isDirectory(localDir)) return;

  const isopacksDir = files.pathJoin(localDir, 'isopacks');
  if (isDirectory(isopacksDir)) {
    for (const packageName of files.readdirNoDots(isopacksDir)) {
      const packageDir = files.pathJoin(isopacksDir, packageName);
      if (!isDirectory(packageDir)) continue;
      rewriteJsonFile(
        files.pathJoin(packageDir, 'isopack-buildinfo.json'),
        pathRewrites,
      );
    }
  }

  const pluginCacheDir = files.pathJoin(localDir, 'plugin-cache');
  if (isDirectory(pluginCacheDir)) {
    for (const pluginName of files.readdirNoDots(pluginCacheDir)) {
      const pluginLocalDir = files.pathJoin(pluginCacheDir, pluginName, 'local');
      if (!isDirectory(pluginLocalDir)) continue;
      for (const entry of files.readdirNoDots(pluginLocalDir)) {
        if (entry.endsWith('.json')) {
          rewriteJsonFile(
            files.pathJoin(pluginLocalDir, entry),
            pathRewrites,
          );
        }
      }
    }
  }

  const offenders = [];
  safelyWalk(localDir, (relativePath, absolutePath, stat) => {
    const extension = files.pathExtname(relativePath).toLowerCase();
    if (SKIP_GUARD_EXTENSIONS.has(extension) || stat.size === 0 || stat.size > 8 * 1024 * 1024) {
      return;
    }
    try {
      if (pathRewrites.some(({ fromPrefix }) =>
        files.readFile(absolutePath, 'utf8').includes(fromPrefix))) {
        offenders.push(relativePath);
      }
    } catch {
      // Binary data and unreadable files cannot safely be interpreted as text.
    }
  });
  if (offenders.length > 0) {
    throw new Error(
      `prepared-app-cache left stale source paths in ${offenders.slice(0, 10).join(', ')}`,
    );
  }
}

function cacheEntryPaths(root, cacheKey) {
  if (!CACHE_KEY_RE.test(cacheKey)) return null;
  const cacheDir = files.pathJoin(root, cacheKey);
  if (!isDirectChild(root, cacheDir, CACHE_KEY_RE)) return null;
  return {
    cacheDir,
    metadataPath: files.pathJoin(cacheDir, METADATA_FILE),
    readyPath: files.pathJoin(cacheDir, READY_MARKER),
    snapshotDir: files.pathJoin(cacheDir, SNAPSHOT_DIRECTORY),
  };
}

function validatedCacheEntry(
  root, cacheKey, expectedToolsDir, expectedEnvironmentFingerprint,
) {
  const paths = cacheEntryPaths(root, cacheKey);
  if (!paths || !isDirectory(paths.cacheDir) ||
      !isRegularFile(paths.readyPath) || !isRegularFile(paths.metadataPath) ||
      !isDirectory(paths.snapshotDir) || !snapshotIsSafe(paths.snapshotDir)) {
    return null;
  }

  let metadata;
  try {
    metadata = JSON.parse(files.readFile(paths.metadataPath, 'utf8'));
  } catch {
    return null;
  }
  if (!metadata || typeof metadata !== 'object' ||
      metadata.version !== CACHE_FORMAT_VERSION ||
      metadata.cacheKey !== cacheKey ||
      metadata.snapshotDirectory !== SNAPSHOT_DIRECTORY ||
      typeof metadata.producerToolsDir !== 'string' ||
      typeof metadata.environmentFingerprint !== 'string' ||
      typeof metadata.sentinelPath !== 'string') {
    return null;
  }

  const sentinelPath = resolveAbsolutePath(metadata.sentinelPath);
  if (!sentinelPath || !isDirectChild(root, sentinelPath, STAGING_NAME_RE)) {
    return null;
  }
  const producerToolsDir = resolveAbsolutePath(metadata.producerToolsDir);
  if (!producerToolsDir ||
      (expectedToolsDir && producerToolsDir !== expectedToolsDir) ||
      (expectedEnvironmentFingerprint &&
       metadata.environmentFingerprint !== expectedEnvironmentFingerprint)) {
    return null;
  }
  return {
    ...paths,
    root,
    cacheKey,
    sentinelPath,
    producerToolsDir,
    environmentFingerprint: metadata.environmentFingerprint,
  };
}

function createStagingDirectory(root) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const stagingName = `.staging-${process.pid}-${randomBytes(16).toString('hex')}`;
    const stagingDir = files.pathJoin(root, stagingName);
    if (!isDirectChild(root, stagingDir, STAGING_NAME_RE)) {
      throw new Error('prepared-app-cache generated an invalid staging path');
    }
    try {
      files.mkdir(stagingDir, 0o700);
      return stagingDir;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('prepared-app-cache could not allocate a staging directory');
}

async function removeStagingDirectory(root, stagingDir) {
  if (!isDirectChild(root, stagingDir, STAGING_NAME_RE)) return;
  const stat = lstatOrNull(stagingDir);
  if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    await files.rm_recursive(stagingDir);
  } else {
    files.unlink(stagingDir);
  }
}

async function removeClaimedCacheDirectory(root, cacheDir) {
  if (!isDirectChild(root, cacheDir, CACHE_KEY_RE)) return;
  const stat = lstatOrNull(cacheDir);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) return;
  await files.rm_recursive(cacheDir);
}

function staleEntryCanBeReclaimed(paths) {
  const cacheStat = lstatOrNull(paths.cacheDir);
  if (!cacheStat?.isDirectory() || cacheStat.isSymbolicLink()) return false;

  // A ready marker is written last, so a regular marker on an entry that
  // failed validation cannot belong to an active warmer. An incomplete claim
  // has no marker and is left alone until it exceeds the preparation lease.
  const readyStat = lstatOrNull(paths.readyPath);
  if (readyStat?.isFile() && !readyStat.isSymbolicLink()) return true;
  return !readyStat && Date.now() - cacheStat.mtimeMs > STALE_ENTRY_LEASE_MS;
}

function makeQuarantinePath(root, cacheKey) {
  const quarantineName = `.quarantine-${cacheKey}-${process.pid}-${
    randomBytes(16).toString('hex')}`;
  const quarantinePath = files.pathJoin(root, quarantineName);
  return isDirectChild(root, quarantinePath, QUARANTINE_NAME_RE)
    ? quarantinePath
    : null;
}

async function removeQuarantineDirectory(root, quarantinePath) {
  if (!isDirectChild(root, quarantinePath, QUARANTINE_NAME_RE)) return false;
  const stat = lstatOrNull(quarantinePath);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) return false;
  await files.rm_recursive(quarantinePath);
  return true;
}

async function reclaimStaleCacheEntry(root, paths, cacheKey) {
  if (!staleEntryCanBeReclaimed(paths)) return false;

  // Rename first so no racing caller can mistake the old entry for its own,
  // then delete only the controlled direct-child quarantine directory.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const quarantinePath = makeQuarantinePath(root, cacheKey);
    if (!quarantinePath || lstatOrNull(quarantinePath)) continue;
    try {
      await files.rename(paths.cacheDir, quarantinePath);
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') continue;
      return false;
    }
    try {
      return await removeQuarantineDirectory(root, quarantinePath);
    } catch {
      return false;
    }
  }
  return false;
}

async function runPrepareApp({ execPath, cwd, env }) {
  await execFileAsync(files.convertToOSPath(execPath), ['--prepare-app'], {
    cwd: files.convertToOSPath(cwd),
    env: { ...process.env, ...env },
    timeout: PREPARE_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    // `meteor.bat` requires a shell on Windows; both the executable and the
    // sole argument are fixed by the self-test harness, not by test input.
    ...(process.platform === 'win32' ? { shell: true } : {}),
  });
}

async function warmCacheEntry({
  root, cacheKey, templatePath, releaseName, upgradersToAppend, execPath, env,
  producerToolsDir, environmentFingerprint,
}, allowReclaim = true) {
  const paths = cacheEntryPaths(root, cacheKey);
  if (!paths) return null;
  try {
    files.mkdir(paths.cacheDir, 0o700);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const entry = validatedCacheEntry(
      root, cacheKey, producerToolsDir, environmentFingerprint,
    );
    if (entry || !allowReclaim ||
        !await reclaimStaleCacheEntry(root, paths, cacheKey)) {
      return entry;
    }
    return warmCacheEntry({
      root,
      cacheKey,
      templatePath,
      releaseName,
      upgradersToAppend,
      execPath,
      env,
      producerToolsDir,
      environmentFingerprint,
    }, false);
  }

  let preparationStagingDir = null;
  let snapshotStagingDir = null;
  try {
    preparationStagingDir = createStagingDirectory(root);
    await files.cp_r(templatePath, preparationStagingDir, {
      ignore: [/^local$/],
      preserveSymlinks: true,
    });

    if (releaseName) {
      files.writeFile(
        files.pathJoin(preparationStagingDir, '.meteor', 'release'),
        releaseName,
        'utf8',
      );
    }

    const upgradersFile = new FinishedUpgraders({ projectDir: preparationStagingDir });
    if (upgradersFile.readUpgraders().length === 0 && upgradersToAppend.length) {
      upgradersFile.appendUpgraders(upgradersToAppend);
    }
    await defaultNpmDeps.install(preparationStagingDir);
    await runPrepareApp({ execPath, cwd: preparationStagingDir, env });

    snapshotStagingDir = createStagingDirectory(root);
    materializeSnapshot(preparationStagingDir, snapshotStagingDir, [
      preparationStagingDir,
      producerToolsDir,
    ]);
    if (!snapshotIsSafe(snapshotStagingDir)) {
      throw new Error('prepared-app-cache materialized an unsafe snapshot');
    }

    // The cache key directory is claimed before warming, while the complete
    // snapshot stays invisible in an unrelated staging directory. Promotion
    // is one rename, and the ready marker is written only after it succeeds.
    await removeStagingDirectory(root, preparationStagingDir);
    await files.rename(snapshotStagingDir, paths.snapshotDir);
    snapshotStagingDir = null;
    await files.writeFileAtomically(paths.metadataPath, `${JSON.stringify({
      version: CACHE_FORMAT_VERSION,
      cacheKey,
      snapshotDirectory: SNAPSHOT_DIRECTORY,
      sentinelPath: preparationStagingDir,
      producerToolsDir,
      environmentFingerprint,
    })}\n`);
    await files.writeFileAtomically(paths.readyPath, '');
    const entry = validatedCacheEntry(
      root, cacheKey, producerToolsDir, environmentFingerprint,
    );
    if (!entry) {
      await removeClaimedCacheDirectory(root, paths.cacheDir);
    }
    return entry;
  } catch (error) {
    if (preparationStagingDir) {
      await removeStagingDirectory(root, preparationStagingDir).catch(() => {});
    }
    if (snapshotStagingDir) {
      await removeStagingDirectory(root, snapshotStagingDir).catch(() => {});
    }
    await removeClaimedCacheDirectory(root, paths.cacheDir).catch(() => {});
    throw error;
  }
}

export async function getPreparedAppCacheEntry({
  template, releaseName = null, upgradersToAppend = [], execPath, env = {},
}) {
  if (isDisabled() || !files.inCheckout() ||
      typeof template !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(template)) {
    return null;
  }
  const environmentFingerprint = computeEnvironmentFingerprint(env);
  if (!environmentFingerprint) return null;

  const toolsDir = files.realpath(files.getCurrentToolsDir());
  const templatesDir = files.pathJoin(toolsDir, 'tools', 'tests', 'apps');
  const templatePath = files.pathResolve(templatesDir, template);
  if (!isContainedPath(templatesDir, templatePath) || !isDirectory(templatePath)) {
    return null;
  }
  if (!templateAllowsCache(templatePath)) return null;

  const sourceFingerprint = await computeSourceFingerprint(toolsDir);
  if (!sourceFingerprint) return null;

  const root = makeCacheRoot();
  if (!root) return null;
  const cacheKey = createHash('sha256').update(JSON.stringify({
    version: CACHE_FORMAT_VERSION,
    source: sourceFingerprint,
    checkout: toolsDir,
    environment: environmentFingerprint,
    template: computeTemplateFingerprint(templatePath),
    templateName: template,
    releaseName: releaseName || null,
  })).digest('hex').slice(0, 24);
  return validatedCacheEntry(
    root, cacheKey, toolsDir, environmentFingerprint,
  ) || await warmCacheEntry({
    root,
    cacheKey,
    templatePath,
    releaseName,
    upgradersToAppend,
    execPath,
    env,
    producerToolsDir: toolsDir,
    environmentFingerprint,
  });
}

async function removePartialDestination(destRoot, destAppDir) {
  const root = resolveAbsolutePath(destRoot);
  const destination = resolveAbsolutePath(destAppDir);
  if (!root || !destination || root === destination ||
      !isContainedPath(root, destination)) {
    return;
  }
  const stat = lstatOrNull(destination);
  if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    await files.rm_recursive(destination);
  } else {
    files.unlink(destination);
  }
}

function resolveSafeDestination(destRoot, destAppDir) {
  const root = resolveAbsolutePath(destRoot);
  const destination = resolveAbsolutePath(destAppDir);
  if (!root || !destination || root === destination ||
      !isContainedPath(root, destination) || !isDirectory(root)) {
    return null;
  }

  const destinationParent = files.pathDirname(destination);
  if (!isDirectory(destinationParent) || lstatOrNull(destination)) {
    return null;
  }
  const canonicalRoot = files.realpath(root);
  const canonicalParent = files.realpath(destinationParent);
  const canonicalDestination = files.pathJoin(
    canonicalParent,
    files.pathBasename(destination),
  );
  if (canonicalRoot === canonicalDestination ||
      !isContainedPath(canonicalRoot, canonicalParent) ||
      !isContainedPath(canonicalRoot, canonicalDestination)) {
    return null;
  }
  return { root: canonicalRoot, destination: canonicalDestination };
}

export async function applyPreparedAppCacheEntry({
  cacheEntry, destAppDir, destRoot, env = {},
}) {
  const expectedCacheRoot = makeCacheRoot();
  const cacheRoot = cacheEntry && typeof cacheEntry.root === 'string'
    ? resolveAbsolutePath(cacheEntry.root)
    : null;
  const safeDestination = resolveSafeDestination(destRoot, destAppDir);
  if (!cacheEntry || typeof cacheEntry.root !== 'string' ||
      typeof cacheEntry.cacheKey !== 'string' || !cacheRoot ||
      cacheRoot !== expectedCacheRoot || !safeDestination) {
    return false;
  }
  const { root, destination } = safeDestination;

  let copyStarted = false;
  try {
    const consumerToolsDir = files.realpath(files.getCurrentToolsDir());
    const environmentFingerprint = computeEnvironmentFingerprint(env);
    if (!environmentFingerprint) return false;
    const verifiedEntry = validatedCacheEntry(
      cacheEntry.root,
      cacheEntry.cacheKey,
      consumerToolsDir,
      environmentFingerprint,
    );
    if (!verifiedEntry) return false;

    copyStarted = true;
    await files.cp_r(verifiedEntry.snapshotDir, destination, {
      preserveSymlinks: true,
    });
    const pathRewrites = [{
      fromPrefix: verifiedEntry.sentinelPath,
      toPrefix: destination,
    }];
    if (verifiedEntry.producerToolsDir !== consumerToolsDir) {
      pathRewrites.push({
        fromPrefix: verifiedEntry.producerToolsDir,
        toPrefix: consumerToolsDir,
      });
    }
    rewriteCachedPaths(destination, pathRewrites);
    return true;
  } catch {
    if (copyStarted) {
      await removePartialDestination(root, destination).catch(() => {});
    }
    return false;
  }
}
