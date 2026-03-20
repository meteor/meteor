#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const semver = require('semver');

const VALID_LEVELS = ['major', 'minor', 'patch'];

function usage() {
  console.log(`Usage: node ${path.basename(__filename)} <major|minor|patch> [--beta]`);
  console.log('');
  console.log('Examples:');
  console.log('  patch          # 1.0.1 -> 1.0.2');
  console.log('  minor          # 1.0.1 -> 1.1.0');
  console.log('  major          # 1.0.1 -> 2.0.0');
  console.log('  patch --beta   # 1.0.1 -> 1.0.2-beta.0');
  console.log('  patch --beta   # 1.0.2-beta.0 -> 1.0.2-beta.1 (already beta, bumps beta number)');
  console.log('  minor --beta   # 1.0.2-beta.1 -> 1.1.0-beta.0 (different bump level resets)');
  process.exit(1);
}

const args = process.argv.slice(2);
const level = args[0];
const beta = args.includes('--beta');

if (!level || !VALID_LEVELS.includes(level)) {
  if (level) console.error(`Error: first argument must be major, minor, or patch`);
  usage();
}

const pkgPath = path.resolve(__dirname, '..', 'package.json');
const raw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);
const current = pkg.version;
const parsed = semver.parse(current);

if (!parsed) {
  console.error(`Error: invalid current version "${current}"`);
  process.exit(1);
}

let newVersion;

if (beta) {
  const isBeta = parsed.prerelease.length > 0 && parsed.prerelease[0] === 'beta';

  if (isBeta) {
    // Already a beta. The base version already has a prior bump applied.
    // Check if the same bump level is being requested by inspecting which
    // components are zeroed out (major resets minor+patch, minor resets patch).
    // If the same level, just increment the beta number.
    const { major, minor, patch } = parsed;
    const betaNum = typeof parsed.prerelease[1] === 'number' ? parsed.prerelease[1] : 0;
    let sameLevel = false;

    if (level === 'patch') {
      sameLevel = true;
    } else if (level === 'minor') {
      sameLevel = patch === 0 && minor > 0;
    } else if (level === 'major') {
      sameLevel = minor === 0 && patch === 0;
    }

    if (sameLevel) {
      newVersion = `${major}.${minor}.${patch}-beta.${betaNum + 1}`;
    } else {
      const bumped = semver.inc(`${major}.${minor}.${patch}`, level);
      newVersion = `${bumped}-beta.0`;
    }
  } else {
    // Not a beta yet: bump the base and start at beta.0
    const bumped = semver.inc(current, level);
    newVersion = `${bumped}-beta.0`;
  }
} else {
  if (parsed.prerelease.length > 0) {
    // Currently a prerelease: bump base version from the clean base
    const cleanBase = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    newVersion = semver.inc(cleanBase, level);
  } else {
    newVersion = semver.inc(current, level);
  }
}

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Bumped version: ${current} -> ${newVersion}`);
