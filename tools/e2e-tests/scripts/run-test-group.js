#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const { getGroupJestArgs } = require('../test-groups');

const [groupName, ...extraArgs] = process.argv.slice(2);
let groupArgs;
try {
  groupArgs = getGroupJestArgs(groupName);
} catch (error) {
  console.error(error.message);
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
    ...groupArgs,
    ...extraArgs,
  ],
  {
    cwd: testRoot,
    stdio: 'inherit',
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
