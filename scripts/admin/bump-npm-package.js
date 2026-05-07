#!/usr/bin/env node
'use strict';

/**
 * Generic version bumper for any package under npm-packages/*.
 *
 * Two invocation modes:
 *   - Per-package (cwd):     run from inside npm-packages/<name>/.
 *   - Monorepo (explicit):   pass --package <name> to target a sibling.
 *
 * Release lifecycle: alpha -> beta -> rc -> official.
 *   - No prerelease flag produces an official version (no `-tag.N` suffix).
 *   - --alpha / --beta / --rc keeps you on a prerelease track.
 *
 * Same-level rules (when the current version is already a prerelease at the
 * target base, i.e. a previous bump at this level already happened):
 *   - same level + same tag        -> bump the prerelease number (.N -> .N+1)
 *   - same level + different tag   -> switch tag, reset to .0
 *   - same level + no tag          -> promote to official (drop the -tag.N)
 *
 * Different-level always resets the prerelease counter and rebases.
 *
 * No npm deps so it can run in any package context.
 */

const fs = require('fs');
const path = require('path');

const VALID_LEVELS = ['major', 'minor', 'patch'];
const VALID_PRERELEASES = ['alpha', 'beta', 'rc'];

function usage() {
  console.log('Usage: bump-npm-package.js <major|minor|patch> [--alpha|--beta|--rc] [--package <name>]');
  console.log('');
  console.log('Per-package shim (run from npm-packages/<name>/):');
  console.log('  npm run bump -- patch');
  console.log('  npm run bump -- patch --beta');
  console.log('');
  console.log('Monorepo entry (run from repo root):');
  console.log('  npm run npm-packages:bump -- meteor-capacitor patch --beta');
  console.log('');
  console.log('Examples (showing transitions):');
  console.log('  patch                 1.0.1            -> 1.0.2');
  console.log('  patch --beta          1.0.1            -> 1.0.2-beta.0');
  console.log('  patch --beta          1.0.2-beta.0     -> 1.0.2-beta.1   (same level + same tag)');
  console.log('  patch --rc            1.0.2-beta.5     -> 1.0.2-rc.0     (same level, switch tag)');
  console.log('  patch                 1.0.2-rc.1       -> 1.0.2          (promote to official)');
  console.log('  minor --beta          1.0.2-beta.5     -> 1.1.0-beta.0   (different level resets)');
  process.exit(1);
}

function parseVersion(v) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v);
  if (!match) throw new Error(`Invalid version: ${v}`);
  const [, major, minor, patch, pre] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: pre ? pre.split('.').map(p => /^\d+$/.test(p) ? Number(p) : p) : [],
  };
}

function bumpBase(parsed, level) {
  if (level === 'major') return { major: parsed.major + 1, minor: 0, patch: 0 };
  if (level === 'minor') return { major: parsed.major, minor: parsed.minor + 1, patch: 0 };
  if (level === 'patch') return { major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 };
  throw new Error(`Invalid level: ${level}`);
}

// True iff the current version is already at the target base for `level`,
// because a previous bump at this level produced it (X.Y.Z-tag.N).
function isSameLevel(parsed, level) {
  if (parsed.prerelease.length === 0) return false;
  if (level === 'patch') return true;
  if (level === 'minor') return parsed.patch === 0 && parsed.minor > 0;
  if (level === 'major') return parsed.minor === 0 && parsed.patch === 0;
  return false;
}

function computeNext(current, level, prereleaseTag) {
  const parsed = parseVersion(current);
  const sameLevel = isSameLevel(parsed, level);

  const targetBase = sameLevel
    ? { major: parsed.major, minor: parsed.minor, patch: parsed.patch }
    : bumpBase(parsed, level);

  const baseStr = `${targetBase.major}.${targetBase.minor}.${targetBase.patch}`;

  if (!prereleaseTag) {
    // Official: same level promotes; different level / fresh just outputs base.
    return baseStr;
  }

  const isPrerelease = parsed.prerelease.length > 0;
  const currentTag = isPrerelease ? parsed.prerelease[0] : null;
  const currentNum =
    isPrerelease && typeof parsed.prerelease[1] === 'number' ? parsed.prerelease[1] : 0;

  if (sameLevel && currentTag === prereleaseTag) {
    return `${baseStr}-${prereleaseTag}.${currentNum + 1}`;
  }
  return `${baseStr}-${prereleaseTag}.0`;
}

function resolvePkgPath(args) {
  const idx = args.indexOf('--package');
  if (idx !== -1) {
    const name = args[idx + 1];
    if (!name) {
      console.error('Error: --package requires a value');
      usage();
    }
    args.splice(idx, 2);
    const pkgDir = path.resolve(__dirname, '..', '..', 'npm-packages', name);
    const pkgPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      console.error(`Error: ${pkgPath} not found`);
      process.exit(1);
    }
    return pkgPath;
  }
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error(`Error: no package.json in ${process.cwd()}`);
    console.error('Either run from inside an npm-packages/<name>/ directory or pass --package <name>.');
    process.exit(1);
  }
  return pkgPath;
}

const args = process.argv.slice(2);
const pkgPath = resolvePkgPath(args);

const level = args[0];
const prereleaseFlags = VALID_PRERELEASES.filter(tag => args.includes(`--${tag}`));

if (!level || !VALID_LEVELS.includes(level)) {
  if (level) console.error('Error: first argument must be major, minor, or patch');
  usage();
}
if (prereleaseFlags.length > 1) {
  console.error(`Error: pick at most one of --${VALID_PRERELEASES.join(' / --')}`);
  usage();
}

const prereleaseTag = prereleaseFlags[0] || null;

const raw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);
const current = pkg.version;
const newVersion = computeNext(current, level, prereleaseTag);

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Bumped ${pkg.name}: ${current} -> ${newVersion}`);
