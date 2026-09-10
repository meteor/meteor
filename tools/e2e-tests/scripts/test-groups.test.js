const {
  createUncategorizedPattern,
  EXPLICIT_TEST_GROUPS,
  getGroupJestArgs,
  getTestGroupMatrix,
  GROUP_EXCLUDED_TEST_PATH_PATTERN,
  matchesTestGroup,
  TEST_GROUPS,
} = require('../test-groups');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { auditTestCoverage } = require('./audit-test-groups');

describe('CLI / E2E test group fallback /', () => {
  test('keeps server runtime separate from the remaining regressions', () => {
    const matchingGroups = name => Object.entries(EXPLICIT_TEST_GROUPS)
      .filter(([, group]) => new RegExp(group.pattern).test(name))
      .map(([group]) => group);

    expect(matchingGroups('Regressions / Server Runtime / builds the app'))
      .toEqual(['server_runtime']);
    expect(matchingGroups('Regressions / Concurrent Modes / isolates artifacts'))
      .toEqual(['regressions']);
    expect(matchingGroups('Regression / npm-shrinkwrap transitive deps / honours pins'))
      .toEqual(['regressions']);
    expect(matchingGroups('Rspack bundle probe fails with diagnostics'))
      .toEqual(['regressions']);
    expect(matchingGroups('Pnpm Monorepo App Bundling / installs dependencies'))
      .toEqual(['monorepo']);
    expect(matchingGroups('Meteor Skeletons / Pnpm Skeleton / creates the app'))
      .toEqual(['monorepo']);
    expect(matchingGroups('Blaze Router Integration / renders a route'))
      .toEqual(['blaze']);
    expect(matchingGroups('Meteor Skeletons / PWA Skeleton / registers its worker'))
      .toEqual(['pwa']);
  });

  test('selects names that do not match an explicit group', () => {
    const pattern = new RegExp(createUncategorizedPattern({
      alpha: { pattern: '^Alpha /' },
      beta: { pattern: '^(?:Beta /|Gamma /)' },
    }));

    expect(pattern.test('New suite / should still run')).toBe(true);
    expect(pattern.test('Alpha / should use alpha')).toBe(false);
    expect(pattern.test('Beta / should use beta')).toBe(false);
    expect(pattern.test('Gamma / should also use beta')).toBe(false);
  });

  test('derives the configured fallback from every explicit group', () => {
    expect(TEST_GROUPS.uncategorized.pattern).toBe(
      createUncategorizedPattern(EXPLICIT_TEST_GROUPS)
    );
    expect(TEST_GROUPS.uncategorized.fallback).toBe(true);
  });

  test('keeps fixtures and the dedicated Accounts suite outside the fallback', () => {
    expect(getGroupJestArgs('uncategorized')).toEqual([
      '--testNamePattern', TEST_GROUPS.uncategorized.pattern,
      '--testPathIgnorePatterns',
      GROUP_EXCLUDED_TEST_PATH_PATTERN,
    ]);
    expect(
      new RegExp(GROUP_EXCLUDED_TEST_PATH_PATTERN).test(
        '/workspace/accounts.test.js'
      )
    ).toBe(true);
    expect(
      new RegExp(GROUP_EXCLUDED_TEST_PATH_PATTERN).test(
        '/workspace/apps/example/tests/main.test.js'
      )
    ).toBe(true);
  });

  test('every group belongs to exactly one workflow matrix', () => {
    const modern = getTestGroupMatrix().include;
    const accounts = getTestGroupMatrix('accounts').include;
    expect(accounts).toEqual([{ category: 'Accounts', group: 'accounts' }]);
    const names = [...modern, ...accounts].map(({ group }) => group);
    expect(names.sort()).toEqual(Object.keys(TEST_GROUPS).sort());
    expect(new Set(names).size).toBe(names.length);
  });

  test('Accounts selection uses the file path even if test names change', () => {
    expect(getGroupJestArgs('accounts')).toContain('accounts\\.test\\.js$');
    const renamedTest = 'CLI / newly named accounts assertion';
    expect(matchesTestGroup(TEST_GROUPS.accounts, '/workspace/accounts.test.js', renamedTest)).toBe(true);
    expect(matchesTestGroup(TEST_GROUPS.cli, '/workspace/accounts.test.js', renamedTest)).toBe(false);
    expect(matchesTestGroup(TEST_GROUPS.accounts, '/workspace/new.test.js', renamedTest)).toBe(false);
  });

  test('audits every discovered test, including Accounts and new suites', () => {
    const groups = {
      cli: TEST_GROUPS.cli,
      accounts: TEST_GROUPS.accounts,
      uncategorized: TEST_GROUPS.uncategorized,
    };
    const discovered = [
      { name: '/workspace/cli.test.js', assertionResults: [{ fullName: 'CLI / one' }] },
      { name: '/workspace/accounts.test.js', assertionResults: [{ fullName: 'Renamed account test' }] },
      { name: '/workspace/new.test.js', assertionResults: [{ fullName: 'New suite / one' }] },
    ];
    const audit = auditTestCoverage(discovered, groups);
    expect(audit.ok).toBe(true);
    expect(audit.total).toBe(3);
    expect(audit.groupCounts).toEqual({ cli: 1, accounts: 1, uncategorized: 1 });
    expect(audit.uncategorizedTests[0].fullName).toBe('New suite / one');

    expect(auditTestCoverage(discovered, { ...groups, duplicate: groups.cli }).ok).toBe(false);
    expect(auditTestCoverage(discovered, { cli: groups.cli, accounts: groups.accounts }).ok).toBe(false);
    expect(auditTestCoverage(discovered, { ...groups, empty: { pattern: '^Missing /' } }).ok).toBe(false);
    expect(auditTestCoverage([], groups).ok).toBe(false);
  });

  test.each([true, false])('fallback propagates an unassigned test result (passes=%s)', passes => {
    const testRoot = path.resolve(__dirname, '..');
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-group-probe-'));
    const probePath = path.join(probeDir, 'unassigned.test.js');
    try {
      fs.symlinkSync(path.join(testRoot, 'node_modules'), path.join(probeDir, 'node_modules'), 'junction');
      fs.writeFileSync(probePath, `test('Unassigned group probe', () => { expect(${passes}).toBe(true); });`);
      const result = spawnSync(process.execPath, [
        path.join(__dirname, 'run-test-group.js'), 'uncategorized',
        '--rootDir', probeDir,
        '--setupFilesAfterEnv', path.join(testRoot, 'jest.setup.js'),
        '--runTestsByPath', probePath, '--env=node', '--reporters=default',
      ], { cwd: testRoot, encoding: 'utf8' });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(passes ? 0 : 1);
      expect(result.stderr).toContain('Unassigned group probe');
    } finally {
      fs.rmSync(probeDir, { recursive: true, force: true });
    }
  });

  test('does not leak npm working-directory prefixes into E2E setup', () => {
    expect(process.env.npm_config_prefix).toBeUndefined();
    expect(process.env.npm_config_local_prefix).toBeUndefined();
    expect(process.env.NPM_CONFIG_PREFIX).toBeUndefined();
    expect(process.env.NPM_CONFIG_LOCAL_PREFIX).toBeUndefined();
  });
});
