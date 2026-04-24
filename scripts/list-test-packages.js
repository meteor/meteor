#!/usr/bin/env node
// List core packages that have Package.onTest(...) in their package.js,
// optionally limited to a single shard (for the Phase 6 test-in-console
// matrix) and filtered by an exclude regex.
//
// Plain Node, no external deps — this runs before ./meteor is guaranteed
// to exist in CI (we shard outside the meteor tool).
//
// Usage:
//   node scripts/list-test-packages.js
//   node scripts/list-test-packages.js --shard 2/6
//   node scripts/list-test-packages.js --shard 2/6 --exclude stylus
//
// Output: one package name per line (alphabetically), on stdout. Warnings
// go to stderr.
//
// Shard selection is deterministic: after sorting names alphabetically,
// package at index i goes to shard (i % N) + 1. This spreads heavy and
// light packages reasonably well across shards because alphabetical
// order doesn't correlate with test weight. A smarter strategy (Phase 8
// with historical durations) can plug in later.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
// Directories to scan. Each entry is a glob-less path; we look for
// <dir>/<pkg>/package.js. Covers core and the deprecated tier that
// test-in-console exercises via METEOR_PACKAGE_DIRS='packages/deprecated'.
const PACKAGE_DIRS = [
  path.join(REPO_ROOT, 'packages'),
  path.join(REPO_ROOT, 'packages', 'deprecated'),
];

function parseArgs(argv) {
  const out = { shard: null, exclude: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shard') {
      out.shard = argv[++i];
    } else if (a.startsWith('--shard=')) {
      out.shard = a.slice('--shard='.length);
    } else if (a === '--exclude') {
      out.exclude = argv[++i];
    } else if (a.startsWith('--exclude=')) {
      out.exclude = a.slice('--exclude='.length);
    } else if (a === '-h' || a === '--help') {
      out.help = true;
    } else if (a.startsWith('-')) {
      process.stderr.write(`unknown flag: ${a}\n`);
      process.exit(2);
    }
  }
  return out;
}

function parseShard(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d+)\/(\d+)$/);
  if (!m) {
    process.stderr.write(`--shard must look like i/N (got "${raw}")\n`);
    process.exit(2);
  }
  const i = parseInt(m[1], 10);
  const n = parseInt(m[2], 10);
  if (i < 1 || n < 1 || i > n) {
    process.stderr.write(`--shard bounds invalid: i=${i} N=${n}\n`);
    process.exit(2);
  }
  return { i, n };
}

// Fast `grep -l "Package.onTest"` replacement without shelling out.
function hasOnTest(packageJsPath) {
  let source;
  try {
    source = fs.readFileSync(packageJsPath, 'utf8');
  } catch (_) {
    return false;
  }
  // Permissive check — matches `Package.onTest(` or `Package . onTest (`.
  return /Package\s*\.\s*onTest\s*\(/.test(source);
}

function collectPackages() {
  const seen = new Set();
  const names = [];
  for (const baseDir of PACKAGE_DIRS) {
    let entries;
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      // Skip "deprecated" itself when scanning packages/, we recurse via
      // PACKAGE_DIRS instead.
      if (baseDir === PACKAGE_DIRS[0] && ent.name === 'deprecated') continue;
      const pkgJs = path.join(baseDir, ent.name, 'package.js');
      if (!fs.existsSync(pkgJs)) continue;
      if (!hasOnTest(pkgJs)) continue;
      if (seen.has(ent.name)) continue;
      seen.add(ent.name);
      names.push(ent.name);
    }
  }
  names.sort();
  return names;
}

function pickShard(names, shard) {
  if (!shard) return names;
  return names.filter((_, idx) => (idx % shard.n) + 1 === shard.i);
}

function compileExclude(raw) {
  if (!raw) return null;
  try {
    return new RegExp(raw);
  } catch (err) {
    process.stderr.write(`--exclude is not a valid regex: ${err.message}\n`);
    process.exit(2);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: list-test-packages.js [--shard i/N] [--exclude REGEX]\n',
    );
    return 0;
  }
  const shard = parseShard(args.shard);
  const exclude = compileExclude(args.exclude);
  let names = collectPackages();
  if (exclude) {
    names = names.filter((n) => !exclude.test(n));
  }
  const picked = pickShard(names, shard);
  for (const n of picked) {
    process.stdout.write(n + '\n');
  }
  if (shard) {
    process.stderr.write(
      `shard ${shard.i}/${shard.n}: ${picked.length} of ${names.length} packages\n`,
    );
  } else {
    process.stderr.write(`total: ${names.length} packages\n`);
  }
  return 0;
}

process.exit(main());
