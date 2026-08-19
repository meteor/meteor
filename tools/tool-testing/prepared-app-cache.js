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
const CACHE_FORMAT_VERSION = 1;
const PREPARE_TIMEOUT_MS = 15 * 60 * 1000;
const STAGING_NAME_RE = /^\.staging-[0-9]+-[a-f0-9]{32}$/;
const CACHE_KEY_RE = /^[a-f0-9]{24}$/;
const SKIP_GUARD_EXTENSIONS = new Set(['.wt', '.wiredtiger', '.bson']);

export const isDisabled = () => Boolean(process.env[DISABLE_ENV]);

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

// Descend from a canonical temporary directory one component at a time. This
// prevents the optional test hook from creating a cache through a symlink that
// points outside the temporary-directory boundary.
function makeCacheRoot() {
  const tempRoot = files.realpath(
    files.pathResolve(files.convertToStandardPath(os.tmpdir())),
  );
  const configuredRoot = process.env[CACHE_DIR_ENV]
    ? resolveAbsolutePath(process.env[CACHE_DIR_ENV])
    : files.pathJoin(tempRoot, CACHE_DIRECTORY_NAME);

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
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        return null;
      }
    } else {
      try {
        files.mkdir(next, 0o700);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
      if (!isDirectory(next)) {
        return null;
      }
    }
    current = next;
  }

  const realRoot = files.realpath(current);
  return isContainedPath(tempRoot, realRoot) ? realRoot : null;
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

async function computeSourceFingerprint(toolsDir) {
  const hash = createHash('sha256');
  try {
    const { stdout: head } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: files.convertToOSPath(toolsDir),
    });
    hash.update(`HEAD:${head.trim()}\n`);

    const { stdout: status } = await execFileAsync(
      'git',
      ['status', '--porcelain', '--', 'tools', 'packages'],
      { cwd: files.convertToOSPath(toolsDir), maxBuffer: 16 * 1024 * 1024 },
    );
    for (const line of status.split('\n')) {
      if (!line) continue;
      const relativePath = line.slice(3).replace(/^"(.*)"$/, '$1');
      const absolutePath = files.pathResolve(toolsDir, relativePath);
      if (!isContainedPath(toolsDir, absolutePath)) continue;
      const stat = files.statOrNull(absolutePath);
      hash.update(`${relativePath}:${stat?.size ?? 'missing'}:${stat?.mtimeMs ?? ''}\n`);
    }
  } catch {
    const stat = files.statOrNull(toolsDir);
    hash.update(`MTIME:${stat?.mtimeMs ?? 0}\n`);
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

function rewriteJsonFile(path, fromPrefix, toPrefix) {
  if (!isRegularFile(path)) return;
  let json;
  try {
    json = JSON.parse(files.readFile(path, 'utf8'));
  } catch {
    return;
  }
  files.writeFile(path, `${JSON.stringify(rewriteStrings(json, fromPrefix, toPrefix))}\n`, 'utf8');
}

function rewriteCachedPaths(destinationAppDir, sentinelPath) {
  const localDir = files.pathJoin(destinationAppDir, '.meteor', 'local');
  if (!isDirectory(localDir)) return;

  const isopacksDir = files.pathJoin(localDir, 'isopacks');
  if (isDirectory(isopacksDir)) {
    for (const packageName of files.readdirNoDots(isopacksDir)) {
      const packageDir = files.pathJoin(isopacksDir, packageName);
      if (!isDirectory(packageDir)) continue;
      rewriteJsonFile(
        files.pathJoin(packageDir, 'isopack-buildinfo.json'),
        sentinelPath,
        destinationAppDir,
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
            sentinelPath,
            destinationAppDir,
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
      if (files.readFile(absolutePath, 'utf8').includes(sentinelPath)) {
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

function validatedCacheEntry(root, cacheKey) {
  const paths = cacheEntryPaths(root, cacheKey);
  if (!paths || !isDirectory(paths.cacheDir) ||
      !isRegularFile(paths.readyPath) || !isRegularFile(paths.metadataPath) ||
      !isDirectory(paths.snapshotDir)) {
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
      typeof metadata.sentinelPath !== 'string') {
    return null;
  }

  const sentinelPath = resolveAbsolutePath(metadata.sentinelPath);
  if (!sentinelPath || !isDirectChild(root, sentinelPath, STAGING_NAME_RE)) {
    return null;
  }
  return { ...paths, root, cacheKey, sentinelPath };
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
}) {
  const paths = cacheEntryPaths(root, cacheKey);
  if (!paths) return null;
  try {
    files.mkdir(paths.cacheDir, 0o700);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return validatedCacheEntry(root, cacheKey);
  }

  const stagingDir = createStagingDirectory(root);
  try {
    await files.cp_r(templatePath, stagingDir, {
      ignore: [/^local$/],
      preserveSymlinks: true,
    });

    if (releaseName) {
      files.writeFile(
        files.pathJoin(stagingDir, '.meteor', 'release'),
        releaseName,
        'utf8',
      );
    }

    const upgradersFile = new FinishedUpgraders({ projectDir: stagingDir });
    if (upgradersFile.readUpgraders().length === 0 && upgradersToAppend.length) {
      upgradersFile.appendUpgraders(upgradersToAppend);
    }
    await defaultNpmDeps.install(stagingDir);
    await runPrepareApp({ execPath, cwd: stagingDir, env });

    // The cache key directory is claimed before warming, while the complete
    // snapshot stays invisible in an unrelated staging directory. Promotion
    // is one rename, and the ready marker is written only after it succeeds.
    await files.rename(stagingDir, paths.snapshotDir);
    await files.writeFileAtomically(paths.metadataPath, `${JSON.stringify({
      version: CACHE_FORMAT_VERSION,
      cacheKey,
      snapshotDirectory: SNAPSHOT_DIRECTORY,
      sentinelPath: stagingDir,
    })}\n`);
    await files.writeFileAtomically(paths.readyPath, '');
    return validatedCacheEntry(root, cacheKey);
  } catch (error) {
    await removeStagingDirectory(root, stagingDir).catch(() => {});
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

  const toolsDir = files.getCurrentToolsDir();
  const templatesDir = files.pathJoin(toolsDir, 'tools', 'tests', 'apps');
  const templatePath = files.pathResolve(templatesDir, template);
  if (!isContainedPath(templatesDir, templatePath) || !isDirectory(templatePath)) {
    return null;
  }

  const root = makeCacheRoot();
  if (!root) return null;
  const cacheKey = createHash('sha256').update(JSON.stringify({
    version: CACHE_FORMAT_VERSION,
    source: await computeSourceFingerprint(toolsDir),
    template: computeTemplateFingerprint(templatePath),
    templateName: template,
    releaseName: releaseName || null,
  })).digest('hex').slice(0, 24);

  return validatedCacheEntry(root, cacheKey) || await warmCacheEntry({
    root,
    cacheKey,
    templatePath,
    releaseName,
    upgradersToAppend,
    execPath,
    env,
  });
}

export async function applyPreparedAppCacheEntry({ cacheEntry, destAppDir }) {
  if (!cacheEntry || !resolveAbsolutePath(destAppDir)) return false;
  const verifiedEntry = validatedCacheEntry(cacheEntry.root, cacheEntry.cacheKey);
  if (!verifiedEntry) return false;

  await files.cp_r(verifiedEntry.snapshotDir, destAppDir, {
    preserveSymlinks: true,
  });
  rewriteCachedPaths(destAppDir, verifiedEntry.sentinelPath);
  return true;
}
