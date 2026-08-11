#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..', '..', '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8'));
}

const errors = [];
const officialRelease = readJson('scripts/admin/meteor-release-official.json');
const installerPackage = readJson('npm-packages/meteor-installer/package.json');
const installerLock = readJson('npm-packages/meteor-installer/package-lock.json');
const installerConfig = readFileSync(
  resolve(repoRoot, 'npm-packages/meteor-installer/config.js'),
  'utf8',
);

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

requireEqual('official release track', officialRelease.track, 'METEOR');
requireEqual('official release flag', officialRelease.official, true);
requireEqual('installer package name', installerPackage.name, 'meteor');

const versionMatch = officialRelease.version?.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
if (!versionMatch) {
  errors.push(`official release version is not stable semver: ${officialRelease.version}`);
} else {
  const [, major, minor, patch = '0'] = versionMatch;
  const fullVersion = `${major}.${minor}.${patch}`;
  const releaseSelector = patch === '0' ? `${major}.${minor}` : fullVersion;
  const configuredVersion = installerConfig.match(
    /const\s+METEOR_LATEST_VERSION\s*=\s*['"]([^'"]+)['"]/,
  )?.[1];
  const lockRoot = installerLock.packages?.[''];

  requireEqual('official release version', officialRelease.version, releaseSelector);
  requireEqual('installer config version', configuredVersion, releaseSelector);
  requireEqual('installer package version', installerPackage.version, fullVersion);
  requireEqual('installer lockfile version', installerLock.version, fullVersion);
  requireEqual('installer lockfile root version', lockRoot?.version, fullVersion);
  requireEqual('installer lockfile name', installerLock.name, installerPackage.name);
  requireEqual('installer lockfile root name', lockRoot?.name, installerPackage.name);
}

if (errors.length > 0) {
  console.error('Meteor installer version audit failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Meteor installer version audit passed for ${officialRelease.version}.`);
}
