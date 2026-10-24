'use strict';
//
// lib.js — shared helpers for scripts/npm-deps-audit
//
// Meteor core packages declare their npm dependencies with `Npm.depends({...})`
// in package.js (and build plugins with `npmDependencies`). There is no
// package.json or lockfile for them, so neither `npm audit`, Dependabot nor any
// SaaS scanner can see them. This module:
//
//   1. evaluates every packages/*/package.js in a sandbox and collects the
//      declared npm dependencies,
//   2. writes a throwaway package.json per package and generates a lockfile,
//   3. runs `npm audit` against those lockfiles (and any real lockfile dirs),
//      applying the policy in .github/npm-audit-policy.json,
//   4. converts the lockfiles into a dependency-graph snapshot for GitHub's
//      Dependency Submission API so Dependabot alerts cover packages/* too.
//
// No npm dependencies on purpose: this runs in CI before any install step.

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const SEVERITIES = ['critical', 'high', 'moderate', 'low'];
const DETECTOR_NAME = 'meteor-packages-npm-deps';
const DETECTOR_VERSION = '1.0.0';
const DETECTOR_URL =
  'https://github.com/meteor/meteor/tree/devel/scripts/npm-deps-audit';

// ---------------------------------------------------------------------------
// 1. Extraction
// ---------------------------------------------------------------------------

// A dependency spec npm can resolve from the registry. Git, GitHub, http(s),
// file: and link: specs cannot be audited and are reported separately.
function isRegistrySpec(spec) {
  return typeof spec === 'string' && /^[\d^~>=<*xX\s|.-]+$/.test(spec.trim());
}

// Evaluate one package.js with stubbed Meteor build globals and return the npm
// dependencies it declares. Nothing in package.js runs for real; `api.*`,
// `Package.describe` etc. are no-ops.
function extractNpmDepsFromPackageJs(source, filename) {
  const deps = {};
  const pluginDeps = {};
  const noop = () => {};
  const api = new Proxy({}, { get: () => noop });
  const sandbox = {
    Npm: {
      depends: (d) => Object.assign(deps, d || {}),
      strip: noop,
      require: () => ({}),
    },
    Cordova: { depends: noop },
    Package: {
      describe: noop,
      onUse: (fn) => {
        try {
          fn(api);
        } catch (_e) {
          // Package bodies may call helpers we do not stub; the Npm.depends
          // call we care about is top-level and has already run.
        }
      },
      onTest: noop,
      includeTool: noop,
      registerBuildPlugin: (opts) => {
        if (opts && opts.npmDependencies) {
          Object.assign(pluginDeps, opts.npmDependencies);
        }
      },
    },
    // Deliberately no `require` or `process`: package.js files only need the
    // Meteor build globals, and this runs against pull-request content.
    console: { log: noop, error: noop, warn: noop },
  };
  vm.runInNewContext(source, sandbox, { filename, timeout: 5000 });

  const dependencies = {};
  const unauditable = {};
  for (const [name, spec] of Object.entries({ ...deps, ...pluginDeps })) {
    if (isRegistrySpec(spec)) dependencies[name] = spec;
    else unauditable[name] = spec;
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
    if (!/Npm\.depends|npmDependencies/.test(source)) continue;
    const sourcePath = path.posix.join('packages', name, 'package.js');
    try {
      const { dependencies, unauditable } = extractNpmDepsFromPackageJs(
        source,
        file
      );
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
        error: e && e.message ? e.message : String(e),
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
      log(`  ! ${pkg.name}: could not evaluate package.js: ${pkg.error}`);
      return entry;
    }
    if (!Object.keys(pkg.dependencies).length) {
      log(`  - ${pkg.name}: only unauditable specs, skipping lockfile`);
      return entry;
    }
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
// 3. Audit + policy
// ---------------------------------------------------------------------------

function loadPolicy(file) {
  const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Object.prototype.hasOwnProperty.call(SEVERITY_RANK, policy.failOn) && policy.failOn !== 'none') {
    throw new Error(
      `${file}: "failOn" must be one of ${Object.keys(SEVERITY_RANK).join(', ')} or "none"`
    );
  }
  if (!Array.isArray(policy.allow)) throw new Error(`${file}: "allow" must be an array`);
  for (const entry of policy.allow) {
    if (!/^GHSA-[\w]{4}-[\w]{4}-[\w]{4}$/.test(entry.ghsa || '')) {
      throw new Error(`${file}: allow entry has invalid ghsa id: ${JSON.stringify(entry)}`);
    }
    if (!entry.reason) throw new Error(`${file}: allow entry ${entry.ghsa} needs a "reason"`);
    if (!entry.expires || Number.isNaN(Date.parse(entry.expires))) {
      throw new Error(`${file}: allow entry ${entry.ghsa} needs an "expires" date (YYYY-MM-DD)`);
    }
  }
  return policy;
}

function activeAllowlist(policy, now = new Date()) {
  const active = new Map();
  const expired = [];
  for (const entry of policy.allow) {
    if (Date.parse(entry.expires) < now.getTime()) expired.push(entry);
    else active.set(entry.ghsa, entry);
  }
  return { active, expired };
}

async function runNpmAudit(dir) {
  // npm audit exits 1 when it finds anything, so the exit code is not an error.
  const res = await run('npm', ['audit', '--json', '--omit=dev'], { cwd: dir });
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch (_e) {
    throw new Error(`npm audit produced no JSON in ${dir}:\n${res.stderr.trim()}`);
  }
  if (report.error) {
    throw new Error(`npm audit failed in ${dir}: ${report.error.summary || report.error.code}`);
  }
  return report;
}

function ghsaFromVia(via) {
  const m = /GHSA-[\w]{4}-[\w]{4}-[\w]{4}/.exec(via.url || '');
  if (m) return m[0];
  return via.source ? `npm-${via.source}` : `${via.name}@${via.range}`;
}

function describeFix(node) {
  if (node.fixAvailable === true) return 'lockfile refresh';
  if (node.fixAvailable && node.fixAvailable.name) {
    return `bump ${node.fixAvailable.name} to ${node.fixAvailable.version}` +
      (node.fixAvailable.isSemVerMajor ? ' (major)' : '');
  }
  return 'none available';
}

// Flatten an `npm audit --json` report into one row per advisory and classify
// each row against the policy.
function summarizeAudit(report, policy, now = new Date()) {
  const { active, expired } = activeAllowlist(policy, now);
  const threshold = policy.failOn === 'none' ? Infinity : SEVERITY_RANK[policy.failOn];
  const byId = new Map();
  for (const node of Object.values(report.vulnerabilities || {})) {
    for (const via of node.via || []) {
      if (typeof via !== 'object') continue; // a string is a transitive pointer
      const id = ghsaFromVia(via);
      const row = {
        id,
        severity: via.severity || node.severity,
        title: via.title || '',
        package: via.name || node.name,
        range: via.range || node.range,
        isDirect: !!node.isDirect,
        fix: describeFix(node),
        url: via.url || '',
      };
      const prev = byId.get(id);
      if (!prev || SEVERITY_RANK[row.severity] > SEVERITY_RANK[prev.severity]) {
        byId.set(id, row);
      }
    }
  }
  const advisories = [...byId.values()].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.package.localeCompare(b.package)
  );
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  const allowlisted = [];
  const blocking = [];
  for (const row of advisories) {
    if (active.has(row.id)) {
      row.allow = active.get(row.id);
      allowlisted.push(row);
      continue;
    }
    if (counts[row.severity] !== undefined) counts[row.severity]++;
    if (SEVERITY_RANK[row.severity] >= threshold) blocking.push(row);
  }
  return {
    counts,
    advisories,
    allowlisted,
    blocking,
    expiredAllowEntries: expired,
    totalDependencies: (report.metadata && report.metadata.dependencies && report.metadata.dependencies.total) || 0,
  };
}

// results: [{ label, sourcePath, summary?, error?, unauditable? }]
function renderMarkdown(results, policy) {
  const lines = [];
  const totals = { critical: 0, high: 0, moderate: 0, low: 0 };
  let blockingTotal = 0;
  lines.push(`Policy: fail on **${policy.failOn}** and above in production dependencies; ` +
    `${policy.allow.length} allowlisted advisor${policy.allow.length === 1 ? 'y' : 'ies'}.`);
  lines.push('');
  lines.push('| Package | Critical | High | Moderate | Low | Deps | Status |');
  lines.push('|---|---:|---:|---:|---:|---:|---|');
  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.label} | – | – | – | – | – | ⚠️ ${r.error.split('\n')[0]} |`);
      continue;
    }
    if (!r.summary) {
      lines.push(`| ${r.label} | – | – | – | – | – | skipped (no lockfile) |`);
      continue;
    }
    const s = r.summary;
    for (const k of SEVERITIES) totals[k] += s.counts[k];
    blockingTotal += s.blocking.length;
    let status = s.blocking.length ? `❌ ${s.blocking.length} blocking` : '✅';
    if (s.allowlisted.length) status += ` (${s.allowlisted.length} allowlisted)`;
    lines.push(
      `| ${r.label} | ${s.counts.critical} | ${s.counts.high} | ${s.counts.moderate} | ${s.counts.low} | ${s.totalDependencies} | ${status} |`
    );
  }
  lines.push(`| **Total** | **${totals.critical}** | **${totals.high}** | **${totals.moderate}** | **${totals.low}** | | ${blockingTotal ? `❌ ${blockingTotal} blocking` : '✅'} |`);
  lines.push('');

  const blockingRows = results.flatMap((r) =>
    (r.summary ? r.summary.blocking : []).map((row) => ({ ...row, label: r.label }))
  );
  if (blockingRows.length) {
    lines.push('### Blocking advisories');
    lines.push('');
    lines.push('| Package | Severity | Advisory | Dependency | Fix |');
    lines.push('|---|---|---|---|---|');
    for (const row of blockingRows) {
      const adv = row.url ? `[${row.id}](${row.url})` : row.id;
      lines.push(`| ${row.label} | ${row.severity} | ${adv} ${row.title} | \`${row.package}@${row.range}\`${row.isDirect ? ' (direct)' : ''} | ${row.fix} |`);
    }
    lines.push('');
  }

  const allowRows = results.flatMap((r) =>
    (r.summary ? r.summary.allowlisted : []).map((row) => ({ ...row, label: r.label }))
  );
  if (allowRows.length) {
    lines.push('### Allowlisted advisories');
    lines.push('');
    lines.push('| Package | Severity | Advisory | Reason | Expires |');
    lines.push('|---|---|---|---|---|');
    for (const row of allowRows) {
      lines.push(`| ${row.label} | ${row.severity} | ${row.id} | ${row.allow.reason} | ${row.allow.expires} |`);
    }
    lines.push('');
  }

  const expired = results.length && results.find((r) => r.summary)
    ? results.find((r) => r.summary).summary.expiredAllowEntries
    : [];
  if (expired.length) {
    lines.push('### Expired allowlist entries (no longer suppressing anything)');
    lines.push('');
    for (const e of expired) lines.push(`- ${e.ghsa} expired ${e.expires}: ${e.reason}`);
    lines.push('');
  }

  const unauditable = results.filter((r) => r.unauditable && Object.keys(r.unauditable).length);
  if (unauditable.length) {
    lines.push('### Dependencies npm cannot audit (git/http specs)');
    lines.push('');
    for (const r of unauditable) {
      for (const [name, spec] of Object.entries(r.unauditable)) {
        lines.push(`- ${r.label}: \`${name}\` → \`${spec}\``);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 4. Dependency Submission API snapshot
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
  SEVERITY_RANK,
  SEVERITIES,
  isRegistrySpec,
  extractNpmDepsFromPackageJs,
  collectMeteorPackageDeps,
  writeManifest,
  generateLockfile,
  generateAll,
  readIndex,
  loadPolicy,
  activeAllowlist,
  runNpmAudit,
  summarizeAudit,
  renderMarkdown,
  purl,
  lockfileToResolved,
  buildSnapshot,
  submitSnapshot,
  defaultOutDir,
  mapConcurrent,
};
