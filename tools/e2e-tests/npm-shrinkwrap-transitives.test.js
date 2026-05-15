/**
 * @jest-environment node
 */
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import semver from 'semver';

import {
  appendFileContent,
  buildMeteorApp,
  cleanupTempDir,
  setupMeteorApp,
} from './helpers';

const { linkLocalRspack } = require('./scripts/link-rspack');

const TOP_LEVEL_DEP = '@aws-sdk/credential-providers';
const TOP_LEVEL_VERSION = '3.1009.0';
// Always present in the @aws-sdk transitive tree, with many patch releases.
const PINNED_TRANSITIVE = 'tslib';
const FIXTURE_PACKAGE_NAME = 'regression-transitive-deps';
const TEST_TIMEOUT = process.env.CI ? 900_000 : 600_000;

function npmViewJson(spec, field) {
  const args = ['view', spec];
  if (field) args.push(field);
  args.push('--json');
  return JSON.parse(execSync(`npm ${args.join(' ')}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }));
}

function findInTree(shrinkwrap, name) {
  function walk(deps) {
    if (!deps) return null;
    for (const [n, info] of Object.entries(deps)) {
      if (n === name) return info;
      const found = walk(info && info.dependencies);
      if (found) return found;
    }
    return null;
  }
  return walk(shrinkwrap.dependencies);
}

function patchInTree(shrinkwrap, name, patch) {
  let occurrences = 0;
  function walk(deps) {
    if (!deps) return;
    for (const [n, info] of Object.entries(deps)) {
      if (n === name && info) {
        info.version = patch.version;
        info.integrity = patch.integrity;
        info.resolved = patch.resolved;
        occurrences += 1;
      }
      walk(info && info.dependencies);
    }
  }
  walk(shrinkwrap.dependencies);
  return occurrences;
}

describe('Regression / npm-shrinkwrap transitive deps /', () => {
  let tempDir;
  const buildOutputDirs = [];

  beforeAll(async () => {
    tempDir = (await setupMeteorApp('server-only')).tempDir;
    await linkLocalRspack(tempDir);

    const pkgDir = path.join(tempDir, 'packages', FIXTURE_PACKAGE_NAME);
    await fs.ensureDir(pkgDir);
    await fs.writeFile(
      path.join(pkgDir, 'package.js'),
      [
        `Package.describe({`,
        `  name: '${FIXTURE_PACKAGE_NAME}',`,
        `  version: '1.0.0',`,
        `  summary: 'Regression fixture for npm-shrinkwrap transitive pinning bug',`,
        `});`,
        ``,
        `Npm.depends({`,
        `  '${TOP_LEVEL_DEP}': '${TOP_LEVEL_VERSION}',`,
        `});`,
        ``,
        `Package.onUse(function (api) {`,
        `  api.use('ecmascript');`,
        `  api.mainModule('main.js', 'server');`,
        `});`,
        ``,
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(pkgDir, 'main.js'),
      `console.log('${FIXTURE_PACKAGE_NAME} loaded');\n`,
    );

    await appendFileContent(tempDir, '.meteor/packages', {
      content: `\n${FIXTURE_PACKAGE_NAME}\n`,
    });
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await cleanupTempDir(tempDir);
    for (const dir of buildOutputDirs) {
      await cleanupTempDir(dir);
    }
  });

  it(
    'honours transitive pins in committed npm-shrinkwrap.json after node_modules wipe',
    async () => {
      const packageNpmDir = path.join(
        tempDir, 'packages', FIXTURE_PACKAGE_NAME, '.npm', 'package',
      );
      const shrinkwrapPath = path.join(packageNpmDir, 'npm-shrinkwrap.json');
      const nodeModulesPath = path.join(packageNpmDir, 'node_modules');

      const first = await buildMeteorApp(tempDir);
      buildOutputDirs.push(first.buildOutputDir);

      expect(await fs.pathExists(shrinkwrapPath)).toBe(true);
      const shrinkwrap = await fs.readJson(shrinkwrapPath);
      expect(shrinkwrap.dependencies && shrinkwrap.dependencies[TOP_LEVEL_DEP])
        .toBeDefined();

      const currentTransitive = findInTree(shrinkwrap, PINNED_TRANSITIVE);
      expect(currentTransitive).toBeTruthy();
      const currentVersion = currentTransitive.version;
      expect(semver.valid(currentVersion)).toBeTruthy();

      // Same-major older version so it still satisfies every parent's range.
      const allVersions = npmViewJson(PINNED_TRANSITIVE, 'versions');
      const olderCandidates = allVersions.filter(v =>
        semver.valid(v) &&
        semver.major(v) === semver.major(currentVersion) &&
        semver.lt(v, currentVersion),
      );
      const olderVersion = olderCandidates[olderCandidates.length - 1];
      expect(olderVersion).toBeTruthy();
      expect(olderVersion).not.toBe(currentVersion);

      const olderDist = npmViewJson(`${PINNED_TRANSITIVE}@${olderVersion}`, 'dist');
      expect(olderDist.integrity).toBeTruthy();
      expect(olderDist.tarball).toBeTruthy();

      const occurrences = patchInTree(shrinkwrap, PINNED_TRANSITIVE, {
        version: olderVersion,
        integrity: olderDist.integrity,
        resolved: olderDist.tarball,
      });
      expect(occurrences).toBeGreaterThan(0);
      await fs.writeFile(
        shrinkwrapPath,
        JSON.stringify(shrinkwrap, null, 2) + '\n',
      );

      await fs.remove(nodeModulesPath);
      expect(await fs.pathExists(shrinkwrapPath)).toBe(true);
      expect(await fs.pathExists(nodeModulesPath)).toBe(false);

      const second = await buildMeteorApp(tempDir);
      buildOutputDirs.push(second.buildOutputDir);

      const rebuilt = await fs.readJson(shrinkwrapPath);
      const rebuiltTransitive = findInTree(rebuilt, PINNED_TRANSITIVE);
      expect(rebuiltTransitive).toBeTruthy();
      expect(rebuiltTransitive.version).toBe(olderVersion);
    },
    TEST_TIMEOUT,
  );
});
