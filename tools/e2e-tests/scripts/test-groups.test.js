const {
  createUncategorizedPattern,
  EXPLICIT_TEST_GROUPS,
  GROUP_EXCLUDED_TEST_PATH_PATTERN,
  TEST_GROUPS,
} = require('../test-groups');

describe('CLI / E2E test group fallback /', () => {
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
    expect(TEST_GROUPS.uncategorized.jestArgs).toEqual([
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
});
