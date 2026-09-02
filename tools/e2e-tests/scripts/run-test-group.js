#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const { TEST_GROUPS } = require('../test-groups');

const [groupName, ...extraArgs] = process.argv.slice(2);
const group = TEST_GROUPS[groupName];

if (!group) {
  const availableGroups = Object.keys(TEST_GROUPS).join(', ');
  console.error(
    `Unknown E2E test group "${groupName || ''}". Available groups: ${availableGroups}`
  );
  process.exit(1);
}

const testRoot = path.resolve(__dirname, '..');
const jestBin = path.join(testRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const jestEnv = { ...process.env };

// npm --prefix and nested npm scripts expose their working-directory prefixes
// to descendants. E2E setup later runs npm commands from temporary apps, so an
// inherited prefix can make `npm link` use tools/e2e-tests/lib as its global
// link directory. Let each child npm process resolve its prefix from its cwd.
[
  'npm_config_prefix',
  'npm_config_local_prefix',
  'NPM_CONFIG_PREFIX',
  'NPM_CONFIG_LOCAL_PREFIX',
].forEach(name => delete jestEnv[name]);

const result = spawnSync(
  process.execPath,
  [
    jestBin,
    '--config',
    path.join(testRoot, 'jest.config.js'),
    '--testNamePattern',
    group.pattern,
    ...(group.jestArgs || []),
    ...extraArgs,
  ],
  {
    cwd: testRoot,
    env: jestEnv,
    stdio: 'inherit',
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
