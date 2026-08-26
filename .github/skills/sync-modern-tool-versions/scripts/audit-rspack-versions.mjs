#!/usr/bin/env node

// Audit every active Rspack version source before publishing.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..', '..', '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8'));
}

function stableJson(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJson(child)]),
  );
}

function sameJson(left, right) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function extractVersionConstants(source) {
  const constants = new Map();
  const pattern =
    /(?:export\s+)?const\s+(DEFAULT_[A-Z0-9_]+_VERSION)\s*=\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    constants.set(match[1], match[2]);
  }
  return constants;
}

function packageVersion(packageJson, dependency) {
  for (const section of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    if (packageJson[section]?.[dependency]) {
      return { section, version: packageJson[section][dependency] };
    }
  }
  return null;
}

function parseSemver(value) {
  const match = value?.match(/(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || null,
  };
}

function compareSemver(leftValue, rightValue) {
  const left = parseSemver(leftValue);
  const right = parseSemver(rightValue);
  if (!left || !right) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease, undefined, { numeric: true });
}

const errors = [];
const reviews = [];
const npmPackagePath = 'npm-packages/meteor-rspack/package.json';
const npmLockPath = 'npm-packages/meteor-rspack/package-lock.json';
const constantsPath = 'packages/rspack/lib/constants.js';
const npmPackage = readJson(npmPackagePath);
const npmLock = readJson(npmLockPath);
const lockRoot = npmLock.packages?.[''];
const constantsSource = readFileSync(resolve(repoRoot, constantsPath), 'utf8');
const dependenciesSource = readFileSync(
  resolve(repoRoot, 'packages/rspack/lib/dependencies.js'),
  'utf8',
);
const modernToolsSkillSource = readFileSync(
  resolve(repoRoot, '.github/skills/modern-tools/SKILL.md'),
  'utf8',
);

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

requireEqual('lockfile version', npmLock.version, npmPackage.version);
requireEqual('lockfile root version', lockRoot?.version, npmPackage.version);

for (const section of [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
]) {
  if (!sameJson(lockRoot?.[section], npmPackage[section])) {
    errors.push(`lockfile root ${section} does not match package.json`);
  }
}

const constantNames = {
  '@meteorjs/rspack': 'DEFAULT_METEOR_RSPACK_VERSION',
  '@rspack/core': 'DEFAULT_RSPACK_VERSION',
  '@rspack/cli': 'DEFAULT_RSPACK_VERSION',
  '@rspack/dev-server': 'DEFAULT_RSPACK_DEV_SERVER_VERSION',
  '@rspack/plugin-react-refresh': 'DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION',
  'react-refresh': 'DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION',
  'swc-loader': 'DEFAULT_METEOR_RSPACK_SWC_LOADER_VERSION',
  '@swc/helpers': 'DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION',
  '@swc/core': 'DEFAULT_METEOR_RSPACK_SWC_CORE_VERSION',
  '@rsdoctor/rspack-plugin': 'DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION',
};

const discoveredVersionConstants = extractVersionConstants(constantsSource);
const mappedConstantNames = new Set(Object.values(constantNames));

for (const constantName of discoveredVersionConstants.keys()) {
  if (!mappedConstantNames.has(constantName)) {
    errors.push(`${constantName}: exported version constant has no dependency mapping`);
  }
}

for (const constantName of mappedConstantNames) {
  if (!discoveredVersionConstants.has(constantName)) {
    errors.push(`${constantName}: dependency mapping refers to a missing version constant`);
  }
}

const constants = Object.fromEntries(
  Object.entries(constantNames).map(([dependency, name]) => [
    dependency,
    discoveredVersionConstants.get(name),
  ]),
);

requireEqual(
  'DEFAULT_METEOR_RSPACK_VERSION',
  constants['@meteorjs/rspack'],
  npmPackage.version,
);
const documentedMeteorRspackVersion = modernToolsSkillSource.match(
  /`@meteorjs\/rspack`\s+(\S+)/,
)?.[1];
requireEqual(
  'modern-tools skill @meteorjs/rspack version',
  documentedMeteorRspackVersion,
  `^${npmPackage.version}`,
);

const packageJsonPaths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*package.json'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
  },
)
  .trim()
  .split('\n')
  .filter(Boolean);

for (const relativePath of packageJsonPaths) {
  let manifest;
  try {
    manifest = readJson(relativePath);
  } catch (error) {
    errors.push(`${relativePath}: cannot parse JSON (${error.message})`);
    continue;
  }

  for (const [dependency, defaultVersion] of Object.entries(constants)) {
    if (!defaultVersion) continue;
    const declared = packageVersion(manifest, dependency);
    if (!declared) continue;

    const expected = `^${defaultVersion}`;
    if (relativePath.startsWith('tools/static-assets/skel-')) {
      if (declared.version !== expected) {
        errors.push(
          `${relativePath}: ${dependency} should use recommended ${expected}, got ${declared.version}`,
        );
      }
    } else if (
      relativePath.startsWith('tools/e2e-tests/apps/') &&
      declared.version !== expected
    ) {
      reviews.push(
        `${relativePath}: ${dependency}@${declared.version} differs from recommended ${expected}`,
      );
    }
  }
}

const checkedConstants = new Set();
for (const [dependency, defaultVersion] of Object.entries(constants)) {
  const peerFloor = npmPackage.peerDependencies?.[dependency];
  if (defaultVersion && peerFloor) {
    const comparison = compareSemver(defaultVersion, peerFloor);
    if (comparison === null) {
      reviews.push(
        `${dependency}: cannot compare recommended ${defaultVersion} with peer floor ${peerFloor}`,
      );
    } else if (comparison < 0) {
      errors.push(
        `${dependency}: recommended ${defaultVersion} is below peer floor ${peerFloor}`,
      );
    }
  }

  const constantName = constantNames[dependency];
  if (!checkedConstants.has(constantName)) {
    checkedConstants.add(constantName);
    if (!dependenciesSource.includes(constantName)) {
      reviews.push(`${constantName}: no consumer found in packages/rspack/lib/dependencies.js`);
    }
  }
}

console.log(`@meteorjs/rspack package: ${npmPackage.version}`);
for (const [dependency, version] of Object.entries(constants)) {
  const peer = npmPackage.peerDependencies?.[dependency];
  console.log(
    `${dependency}: recommended ${version || 'none'}${peer ? `, peer floor ${peer}` : ''}`,
  );
}

if (reviews.length > 0) {
  console.log('\nReview compatibility references:');
  for (const review of reviews) console.log(`- ${review}`);
}

if (errors.length > 0) {
  console.error('\nRspack version audit failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('\nRspack version audit passed.');
}
