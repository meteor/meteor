#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  EXPLICIT_TEST_GROUPS,
  GROUP_EXCLUDED_TEST_PATH_PATTERN,
  TEST_GROUPS,
} = require('../test-groups');

const testRoot = path.resolve(__dirname, '..');
const jestBin = path.join(testRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const outputFile = path.join(
  os.tmpdir(),
  `meteor-e2e-test-groups-${process.pid}.json`
);
const workflowPath = path.resolve(
  testRoot,
  '..',
  '..',
  '.github',
  'workflows',
  'e2e-tests.yml'
);
const excludedTestPathPattern = new RegExp(
  GROUP_EXCLUDED_TEST_PATH_PATTERN
);

function escapeWorkflowCommand(value) {
  return value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

try {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const matrixStart = workflow.indexOf('      matrix:\n');
  const matrixEnd = workflow.indexOf('\n    steps:', matrixStart);
  const matrixSection = workflow.slice(matrixStart, matrixEnd);
  const workflowGroups = [...matrixSection.matchAll(
    /^\s+group:\s+([a-z0-9_]+)\s*$/gm
  )].map(match => match[1]);
  const duplicateWorkflowGroups = workflowGroups.filter(
    (name, index) => workflowGroups.indexOf(name) !== index
  );
  const missingWorkflowGroups = Object.keys(TEST_GROUPS).filter(
    name => !workflowGroups.includes(name)
  );
  const unknownWorkflowGroups = workflowGroups.filter(
    name => !TEST_GROUPS[name]
  );
  const workflowGroupErrors = [
    duplicateWorkflowGroups.length > 0 &&
      `duplicate workflow groups: ${[...new Set(duplicateWorkflowGroups)].join(', ')}`,
    missingWorkflowGroups.length > 0 &&
      `groups missing from workflow: ${missingWorkflowGroups.join(', ')}`,
    unknownWorkflowGroups.length > 0 &&
      `unknown workflow groups: ${[...new Set(unknownWorkflowGroups)].join(', ')}`,
  ].filter(Boolean);

  if (matrixStart < 0 || matrixEnd < 0 || workflowGroups.length === 0) {
    workflowGroupErrors.push('could not read groups from the workflow matrix');
  }

  const result = spawnSync(
    process.execPath,
    [
      jestBin,
      '--config',
      path.join(testRoot, 'jest.config.js'),
      '--runInBand',
      '--testNamePattern',
      '(?!)',
      '--json',
      `--outputFile=${outputFile}`,
    ],
    {
      cwd: testRoot,
      env: process.env,
      stdio: 'inherit',
    }
  );

  if (result.error || result.status !== 0) {
    throw result.error || new Error(`Jest discovery exited with ${result.status}`);
  }

  const testResults = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  const groupedTests = [];

  for (const suite of testResults.testResults) {
    // Accounts has its own dedicated workflow and is intentionally outside the
    // modern-tools E2E matrix.
    if (excludedTestPathPattern.test(suite.name)) {
      continue;
    }

    for (const assertion of suite.assertionResults) {
      const matchingGroups = Object.entries(EXPLICIT_TEST_GROUPS)
        .filter(([, group]) => new RegExp(group.pattern).test(assertion.fullName))
        .map(([name]) => name);
      groupedTests.push({
        fullName: assertion.fullName,
        matchingGroups,
      });
    }
  }

  const uncategorizedTests = groupedTests.filter(
    test => test.matchingGroups.length === 0
  );
  const multiplyCategorizedTests = groupedTests.filter(
    test => test.matchingGroups.length > 1
  );
  const groupCounts = Object.fromEntries(
    Object.keys(EXPLICIT_TEST_GROUPS).map(name => [
      name,
      groupedTests.filter(test => test.matchingGroups.includes(name)).length,
    ])
  );
  const emptyGroups = Object.keys(groupCounts).filter(
    name => groupCounts[name] === 0
  );

  if (uncategorizedTests.length > 0) {
    console.warn(
      'Uncategorized E2E tests are covered by the fallback group.'
    );
    console.warn(
      'Assign them to a specific group when practical:'
    );
    uncategorizedTests.forEach(test => {
      console.warn(`- ${test.fullName}`);
      if (process.env.GITHUB_ACTIONS === 'true') {
        console.warn(
          `::warning title=Uncategorized E2E test::${escapeWorkflowCommand(test.fullName)}`
        );
      }
    });
  }

  if (multiplyCategorizedTests.length > 0) {
    console.error('E2E tests selected by more than one group:');
    multiplyCategorizedTests.forEach(test => {
      console.error(
        `- ${test.fullName}\n  matches: ${test.matchingGroups.join(', ')}`
      );
    });
  }

  if (emptyGroups.length > 0) {
    console.error(
      `E2E test groups with no matching tests: ${emptyGroups.join(', ')}`
    );
  }

  if (workflowGroupErrors.length > 0) {
    console.error('E2E workflow group configuration is invalid:');
    workflowGroupErrors.forEach(error => console.error(`- ${error}`));
  }

  if (
    multiplyCategorizedTests.length > 0 ||
    emptyGroups.length > 0 ||
    workflowGroupErrors.length > 0
  ) {
    process.exitCode = 1;
  } else {
    console.log(`E2E group audit passed for ${groupedTests.length} tests:`);
    Object.entries(EXPLICIT_TEST_GROUPS).forEach(([name, group]) => {
      console.log(`- ${group.label}: ${groupCounts[name]}`);
    });
    console.log(
      `- ${TEST_GROUPS.uncategorized.label}: ${uncategorizedTests.length} (fallback)`
    );
  }
} finally {
  fs.rmSync(outputFile, { force: true });
}
