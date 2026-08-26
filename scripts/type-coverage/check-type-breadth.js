#!/usr/bin/env node
/**
 * Type-breadth gate — measures how many user-facing packages ship typings.
 *
 * Unlike `type-coverage` (which measures the QUALITY of existing .ts/.d.ts and is
 * blind to packages with no types at all), this is package-driven: it starts from
 * the curated manifest and asserts every "needsTypes" package ships a .d.ts.
 *
 * Manifest: scripts/type-coverage/packages-manifest.json
 *   - needsTypes: packages a dev imports from, or that augment a shared public
 *                 surface (e.g. accounts-password augmenting `meteor/meteor`).
 *   - waived:     internal/build/test/deprecated packages, each with a reason.
 * DEFAULT-DENY: any package not listed in either bucket is UNCLASSIFIED and fails,
 * so a newly-added package must be typed or explicitly waived.
 *
 * Usage:
 *   node scripts/type-coverage/check-type-breadth.js           # report only (exit 0)
 *   node scripts/type-coverage/check-type-breadth.js --strict  # exit 1 if MISSING/UNCLASSIFIED (CI gate)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PKGS = path.join(ROOT, 'packages');
const MANIFEST = path.join(__dirname, 'packages-manifest.json');
const strict = process.argv.includes('--strict');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const needsTypes = new Set(manifest.needsTypes || []);
const waived = manifest.waived || {};

// Git submodules (e.g. packages/non-core/blaze) are separate repos with their own
// typing lifecycle — exclude them from this repo's package-typing list.
function submodulePaths() {
  const gm = path.join(ROOT, '.gitmodules');
  if (!fs.existsSync(gm)) return new Set();
  const out = new Set();
  const re = /^\s*path\s*=\s*(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(fs.readFileSync(gm, 'utf8')))) out.add(path.resolve(ROOT, m[1]));
  return out;
}
const SUBMODULES = submodulePaths();

function findPackageDirs(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name === 'node_modules' || e.name === '.npm' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (SUBMODULES.has(full)) continue; // skip submodule subtree
    if (fs.existsSync(path.join(full, 'package.js'))) acc.push(full);
    findPackageDirs(full, acc);
  }
  return acc;
}

function hasDts(dir) {
  let found = false;
  (function walk(d, depth) {
    if (found || depth > 2) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.npm') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.name.endsWith('.d.ts')) { found = true; return; }
    }
  })(dir, 0);
  return found;
}

const keys = findPackageDirs(PKGS).map((d) => path.relative(PKGS, d)).sort();

const typed = [];
const missing = [];
const unclassified = [];

for (const key of keys) {
  if (key in waived) continue;
  if (needsTypes.has(key)) {
    (hasDts(path.join(PKGS, key)) ? typed : missing).push(key);
  } else {
    unclassified.push(key);
  }
}

const need = typed.length + missing.length;
const pct = need ? Math.round((typed.length / need) * 100) : 100;

console.log('Type-breadth (packages that need types):');
console.log(`  Typed:   ${typed.length}/${need} (${pct}%)`);
console.log(`  Waived:  ${Object.keys(waived).length}`);
console.log(`  Total packages: ${keys.length}`);

if (missing.length) {
  console.log(`\nMISSING types (${missing.length}):`);
  missing.forEach((k) => console.log(`  - ${k}`));
}
if (unclassified.length) {
  console.log(`\nUNCLASSIFIED — not in manifest, classify as needsTypes or waived (${unclassified.length}):`);
  unclassified.forEach((k) => console.log(`  - ${k}`));
}

if (strict && (missing.length || unclassified.length)) {
  console.error(`\n✖ type-breadth failed: ${missing.length} missing, ${unclassified.length} unclassified.`);
  process.exit(1);
}
console.log(`\n✔ report complete${strict ? ' (strict: passed)' : ''}.`);
