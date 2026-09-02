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
const result = spawnSync(
  process.execPath,
  [
    jestBin,
    '--config',
    path.join(testRoot, 'jest.config.js'),
    '--testNamePattern',
    group.pattern,
    ...extraArgs,
  ],
  {
    cwd: testRoot,
    env: process.env,
    stdio: 'inherit',
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
