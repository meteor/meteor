'use strict';
//
// lib.js — shared helpers for scripts/npm-deps-audit
//
// Meteor core packages declare their npm dependencies with `Npm.depends({...})`
// in package.js (and build plugins with `npmDependencies: {...}`). There is no
// package.json or lockfile for them, so neither Socket, Dependabot nor any
// other scanner can see them. This module:
//
//   1. statically parses every packages/*/package.js for those object literals
//      (nothing from package.js is executed, so this is safe to run against
//      pull-request content in a job that holds secrets),
//   2. writes a throwaway package.json per package and generates a lockfile,
//      which the Socket CLI then scans alongside npm-packages/*,
//   3. converts the lockfiles into a dependency-graph snapshot for GitHub's
//      Dependency Submission API so Dependabot alerts cover packages/* too.
//
// No npm dependencies on purpose: this runs in CI before any install step.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DETECTOR_NAME = 'meteor-packages-npm-deps';
const DETECTOR_VERSION = '2.0.0';
const DETECTOR_URL =
  'https://github.com/meteor/meteor/tree/devel/scripts/npm-deps-audit';

// ---------------------------------------------------------------------------
// 1. Static extraction
// ---------------------------------------------------------------------------

class ParseError extends Error {}

function fail(src, i, message) {
  const line = src.slice(0, i).split('\n').length;
  throw new ParseError(`${message} (line ${line})`);
}

// Advance past whitespace and comments.
function skip(src, i) {
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src.startsWith('//', i)) {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl + 1;
    } else if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) fail(src, i, 'Unterminated block comment');
      i = end + 2;
    } else {
      return i;
    }
  }
}

function readString(src, i) {
  const quote = src[i];
  if (quote !== '"' && quote !== "'" && quote !== '`') {
    fail(src, i, 'Expected a string literal');
  }
  let value = '';
  for (let j = i + 1; j < src.length; j++) {
    const ch = src[j];
    if (ch === '\\') {
      value += src[j + 1];
      j++;
    } else if (ch === quote) {
      return { value, end: j + 1 };
    } else if (quote === '`' && src.startsWith('${', j)) {
      fail(src, j, 'Template literals with ${} are not supported');
    } else if (ch === '\n' && quote !== '`') {
      fail(src, j, 'Unterminated string literal');
    } else {
      value += ch;
    }
  }
  return fail(src, i, 'Unterminated string literal');
}

// Parse `{ key: "value", 'other-key': 'value', }` starting at the `{`.
// Values must be string literals; anything else is rejected so the audit can
// never silently miss a dependency that is computed at runtime.
function parseStringObjectLiteral(src, i) {
  i = skip(src, i);
  if (src[i] !== '{') fail(src, i, 'Expected an object literal');
  i++;
  const obj = {};
  for (;;) {
    i = skip(src, i);
    if (src[i] === '}') return { obj, end: i + 1 };
    let key;
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
      ({ value: key, end: i } = readString(src, i));
    } else {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      if (!m) fail(src, i, 'Expected a property name');
      key = m[0];
      i += key.length;
    }
    i = skip(src, i);
    if (src[i] !== ':') fail(src, i, `Expected ':' after property "${key}"`);
    i = skip(src, i + 1);
    if (src[i] !== '"' && src[i] !== "'" && src[i] !== '`') {
      fail(src, i, `Dependency "${key}" must be a string literal`);
    }
    const { value, end } = readString(src, i);
    obj[key] = value;
    i = skip(src, end);
    if (src[i] === ',') {
      i++;
    } else if (src[i] !== '}') {
      fail(src, i, `Expected ',' or '}' after property "${key}"`);
    }
  }
}

// Collect every occurrence of `<pattern> {...}` in the source, skipping
// matches inside comments and strings.
function collectObjectLiterals(src, pattern) {
  const results = [];
  let i = 0;
  while (i < src.length) {
    i = skip(src, i);
    if (i >= src.length) break;
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = readString(src, i).end;
      continue;
    }
    const m = pattern.exec(src.slice(i));
    if (m && m.index === 0) {
      const { obj, end } = parseStringObjectLiteral(src, i + m[0].length);
      results.push(obj);
      i = end;
      continue;
    }
    i++;
  }
  return results;
}

// A dependency spec npm can resolve from the registry. Git, GitHub, http(s),
// file: and link: specs cannot be resolved and are reported separately.
function isRegistrySpec(spec) {
  return typeof spec === 'string' && /^[\d^~>=<*xX\s|.-]+$/.test(spec.trim());
}

// Extract the npm dependencies one package.js declares, without executing it.
function extractNpmDepsFromPackageJs(source) {
  const literals = [
    ...collectObjectLiterals(source, /^Npm\s*\.\s*depends\s*\(/),
    ...collectObjectLiterals(source, /^npmDependencies\s*:/),
  ];
  const dependencies = {};
  const unauditable = {};
  for (const literal of literals) {
    for (const [name, spec] of Object.entries(literal)) {
      if (isRegistrySpec(spec)) dependencies[name] = spec;
      else unauditable[name] = spec;
    }
  }
  return { dependencies, unauditable };
}

// All Meteor core packages that declare npm dependencies.
// Returns [{ name, sourcePath, dependencies, unauditable, error }]
function collectMeteorPackageDeps(repoRoot) {
  const packagesDir = path.join(repoRoot, 'packages');
  const result = [];
  for (const name of fs.readdirSync(packagesDir).sort()) {
    const file = path.join(packagesDir, name, 'package.js');
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!/Npm\s*\.\s*depends|npmDependencies/.test(source)) continue;
    const sourcePath = path.posix.join('packages', name, 'package.js');
    try {
      const { dependencies, unauditable } = extractNpmDepsFromPackageJs(source);
      if (!Object.keys(dependencies).length && !Object.keys(unauditable).length) {
        continue;
      }
      result.push({ name, sourcePath, dependencies, unauditable });
    } catch (e) {
      result.push({
        name,
        sourcePath,
        dependencies: {},
        unauditable: {},
        error: `${sourcePath}: ${e.message}`,
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 2. Lockfile generation
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      ...opts,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

function writeManifest(outDir, pkg) {
  const dir = path.join(outDir, pkg.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: `meteor-package-${pkg.name}`,
        version: '0.0.0',
        private: true,
        description: `Generated from ${pkg.sourcePath} by scripts/npm-deps-audit`,
        dependencies: pkg.dependencies,
      },
      null,
      2
    ) + '\n'
  );
  return dir;
}

async function generateLockfile(dir) {
  // --ignore-scripts and --package-lock-only: only registry metadata is
  // fetched, nothing from the dependencies runs.
  const res = await run(
    'npm',
    [
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
    ],
    { cwd: dir }
  );
  if (res.code !== 0) {
    throw new Error(
      `npm install --package-lock-only failed in ${dir}:\n${res.stderr.trim()}`
    );
  }
}

// Writes <outDir>/<package>/package.json + package-lock.json for every Meteor
// package with npm deps and <outDir>/index.json describing them.
async function generateAll(repoRoot, outDir, { concurrency = 6, log = () => {} } = {}) {
  const packages = collectMeteorPackageDeps(repoRoot);
  fs.mkdirSync(outDir, { recursive: true });
  const entries = await mapConcurrent(packages, concurrency, async (pkg) => {
    const entry = { ...pkg, dir: path.join(outDir, pkg.name) };
    if (pkg.error) {
      log(`  ! ${pkg.name}: ${pkg.error}`);
      return entry;
    }
    for (const [name, spec] of Object.entries(pkg.unauditable)) {
      log(`  - ${pkg.name}: ${name} -> ${spec} (not a registry version, skipped)`);
    }
    if (!Object.keys(pkg.dependencies).length) return entry;
    writeManifest(outDir, pkg);
    try {
      await generateLockfile(entry.dir);
      entry.lockfile = path.join(entry.dir, 'package-lock.json');
      log(`  ✓ ${pkg.name} (${Object.keys(pkg.dependencies).length} direct deps)`);
    } catch (e) {
      entry.error = e.message;
      log(`  ! ${pkg.name}: ${e.message}`);
    }
    return entry;
  });
  fs.writeFileSync(
    path.join(outDir, 'index.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), packages: entries }, null, 2)
  );
  return entries;
}

function readIndex(outDir) {
  const file = path.join(outDir, 'index.json');
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found. Run \`generate --out ${outDir}\` first.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')).packages;
}

// ---------------------------------------------------------------------------
// 3. Dependency Submission API snapshot
// ---------------------------------------------------------------------------

function purl(name, version) {
  // pkg:npm/%40scope/name@1.2.3 — the scope's "@" is percent-encoded.
  const encoded = name.startsWith('@') ? '%40' + name.slice(1) : name;
  return `pkg:npm/${encoded}@${version}`;
}

function nameFromNodePath(nodePath) {
  const i = nodePath.lastIndexOf('node_modules/');
  return nodePath.slice(i + 'node_modules/'.length);
}

// Resolve `depName` as Node would from a package installed at `fromPath`.
function resolveChild(packages, fromPath, depName) {
  let base = fromPath;
  for (;;) {
    const candidate = base ? `${base}/node_modules/${depName}` : `node_modules/${depName}`;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const i = base.lastIndexOf('node_modules/');
    base = i <= 0 ? '' : base.slice(0, i - 1);
  }
}

// Convert a lockfileVersion 2/3 package-lock.json into the `resolved` map of a
// snapshot manifest.
function lockfileToResolved(lock) {
  const packages = lock.packages || {};
  const root = packages[''] || {};
  const direct = new Set(Object.keys(root.dependencies || {}));
  const resolved = {};
  for (const [nodePath, entry] of Object.entries(packages)) {
    if (!nodePath.startsWith('node_modules/') || !entry.version || entry.link) continue;
    const name = nameFromNodePath(nodePath);
    const children = [];
    for (const depName of Object.keys({
      ...(entry.dependencies || {}),
      ...(entry.optionalDependencies || {}),
    })) {
      const childPath = resolveChild(packages, nodePath, depName);
      if (childPath && packages[childPath].version) {
        children.push(purl(depName, packages[childPath].version));
      }
    }
    resolved[nodePath] = {
      package_url: purl(name, entry.version),
      relationship: nodePath === `node_modules/${name}` && direct.has(name) ? 'direct' : 'indirect',
      scope: entry.dev ? 'development' : 'runtime',
      dependencies: children,
    };
  }
  return resolved;
}

function buildSnapshot(entries, env = process.env, now = new Date()) {
  const manifests = {};
  for (const entry of entries) {
    if (!entry.lockfile || !fs.existsSync(entry.lockfile)) continue;
    const lock = JSON.parse(fs.readFileSync(entry.lockfile, 'utf8'));
    manifests[entry.sourcePath] = {
      name: entry.sourcePath,
      file: { source_location: entry.sourcePath },
      metadata: { generator: DETECTOR_NAME },
      resolved: lockfileToResolved(lock),
    };
  }
  return {
    version: 0,
    sha: env.GITHUB_SHA,
    ref: env.GITHUB_REF,
    job: {
      correlator: `${env.GITHUB_WORKFLOW || 'local'}/${env.GITHUB_JOB || DETECTOR_NAME}`,
      id: env.GITHUB_RUN_ID || String(Date.now()),
      html_url:
        env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
          ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
          : undefined,
    },
    detector: { name: DETECTOR_NAME, version: DETECTOR_VERSION, url: DETECTOR_URL },
    scanned: now.toISOString(),
    manifests,
  };
}

async function submitSnapshot(snapshot, env = process.env) {
  for (const key of ['GITHUB_REPOSITORY', 'GITHUB_TOKEN', 'GITHUB_SHA', 'GITHUB_REF']) {
    if (!env[key]) throw new Error(`${key} is required to submit a snapshot`);
  }
  const apiUrl = env.GITHUB_API_URL || 'https://api.github.com';
  const res = await fetch(`${apiUrl}/repos/${env.GITHUB_REPOSITORY}/dependency-graph/snapshots`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot),
  });
  const body = await res.text();
  if (res.status !== 201) {
    throw new Error(`Dependency submission failed: HTTP ${res.status}\n${body}`);
  }
  return JSON.parse(body);
}

function defaultOutDir() {
  return path.join(os.tmpdir(), 'meteor-npm-deps-audit');
}

module.exports = {
  ParseError,
  isRegistrySpec,
  parseStringObjectLiteral,
  extractNpmDepsFromPackageJs,
  collectMeteorPackageDeps,
  writeManifest,
  generateLockfile,
  generateAll,
  readIndex,
  purl,
  lockfileToResolved,
  buildSnapshot,
  submitSnapshot,
  defaultOutDir,
  mapConcurrent,
};
