#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { matchesTestGroup, TEST_GROUPS } = require('../test-groups');

function auditTestCoverage(testResults, groups = TEST_GROUPS) {
  const groupedTests = testResults.flatMap(suite =>
    suite.assertionResults.map(assertion => ({
      fullName: assertion.fullName,
      testPath: suite.name,
      matchingGroups: Object.entries(groups)
        .filter(([, group]) => matchesTestGroup(group, suite.name, assertion.fullName))
        .map(([name]) => name),
    }))
  );
  const groupCounts = Object.fromEntries(Object.keys(groups).map(name => [
    name, groupedTests.filter(test => test.matchingGroups.includes(name)).length,
  ]));
  const uncoveredTests = groupedTests.filter(test => test.matchingGroups.length === 0);
  const overlappingTests = groupedTests.filter(test => test.matchingGroups.length > 1);
  const emptyGroups = Object.keys(groups).filter(name => !groups[name].fallback && groupCounts[name] === 0);
  const uncategorizedTests = groupedTests.filter(test =>
    test.matchingGroups.some(name => groups[name].fallback)
  );

  return {
    total: groupedTests.length,
    groupCounts,
    uncoveredTests,
    overlappingTests,
    emptyGroups,
    uncategorizedTests,
    ok: groupedTests.length > 0 && uncoveredTests.length === 0 &&
      overlappingTests.length === 0 && emptyGroups.length === 0,
  };
}

function escapeWorkflowCommand(value) {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function main() {
  const testRoot = path.resolve(__dirname, '..');
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-e2e-groups-'));
  const outputFile = path.join(outputDir, 'tests.json');
  try {
    const result = spawnSync(process.execPath, [
      path.join(testRoot, 'node_modules', 'jest', 'bin', 'jest.js'),
      '--config', path.join(testRoot, 'jest.config.js'),
      // Register all tests without launching browsers or running app hooks.
      '--env=node',
      '--runInBand',
      '--testNamePattern', '(?!)',
      '--reporters=default',
      '--json', `--outputFile=${outputFile}`,
    ], { cwd: testRoot, env: process.env, stdio: 'inherit' });

    if (result.error || result.status !== 0) {
      throw result.error || new Error(`Jest discovery exited with ${result.status}`);
    }
    const { testResults } = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    const audit = auditTestCoverage(testResults);

    for (const test of audit.uncategorizedTests) {
      console.warn(`Uncategorized E2E test (covered by fallback): ${test.fullName}`);
      if (process.env.GITHUB_ACTIONS === 'true') {
        console.warn(`::warning title=Uncategorized E2E test::${escapeWorkflowCommand(test.fullName)}`);
      }
    }
    for (const test of audit.uncoveredTests) {
      console.error(`E2E test has no group: ${test.fullName} (${test.testPath})`);
    }
    for (const test of audit.overlappingTests) {
      console.error(`E2E test selected more than once: ${test.fullName} (${test.matchingGroups.join(', ')})`);
    }
    if (audit.emptyGroups.length) {
      console.error(`E2E test groups with no matching tests: ${audit.emptyGroups.join(', ')}`);
    }
    if (audit.total === 0) console.error('Jest discovered no E2E tests.');

    console.log(`E2E group audit ${audit.ok ? 'passed' : 'failed'} for ${audit.total} tests (including Accounts):`);
    for (const [name, group] of Object.entries(TEST_GROUPS)) {
      console.log(`- ${group.label}: ${audit.groupCounts[name]}${group.fallback ? ' (fallback)' : ''}`);
    }
    if (!audit.ok) process.exitCode = 1;
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

module.exports = { auditTestCoverage };
if (require.main === module) main();
