const { createIgnoreGlobConfig, createIgnoreRegex } = require('./ignore.js');

// The folder ignores generateEagerTestFile hands to Rspack as the context
// `exclude`. Rspack tests that regex against absolute module paths built with
// the platform separator, so on Windows they arrive with backslashes.
const EAGER_TEST_IGNORES = [
  '**/node_modules/**',
  '**/.meteor/**',
  '**/public/**',
  '**/private/**',
  '**/_build/**',
  '**/client/**',
];

function excludeFor(rootPath) {
  return createIgnoreRegex(createIgnoreGlobConfig(EAGER_TEST_IGNORES), rootPath);
}

describe('createIgnoreRegex', () => {
  describe('POSIX absolute paths', () => {
    const exclude = excludeFor('/Users/dev/app');

    test('excludes ignored folders below the project root', () => {
      expect(exclude.test('/Users/dev/app/node_modules/pkg/index.test.js')).toBe(true);
      expect(exclude.test('/Users/dev/app/client/thing.test.js')).toBe(true);
    });

    test('keeps app test files', () => {
      expect(exclude.test('/Users/dev/app/imports/api/thing.test.js')).toBe(false);
    });

    test('keeps app test files when a parent folder is named private (#14688)', () => {
      const privateExclude = excludeFor('/private/tmp/app');
      expect(privateExclude.test('/private/tmp/app/imports/thing.test.js')).toBe(false);
      expect(privateExclude.test('/private/tmp/app/private/thing.test.js')).toBe(true);
    });
  });

  describe('Windows absolute paths', () => {
    const exclude = excludeFor('C:\\Users\\dev\\app');

    test('excludes ignored folders joined with backslashes (#14513)', () => {
      expect(exclude.test('C:\\Users\\dev\\app\\node_modules\\pkg\\index.test.js')).toBe(true);
      expect(exclude.test('C:\\Users\\dev\\app\\client\\thing.test.js')).toBe(true);
    });

    test('keeps app test files', () => {
      expect(exclude.test('C:\\Users\\dev\\app\\imports\\api\\thing.test.js')).toBe(false);
    });

    test('accepts a forward-slash root joined with backslashes', () => {
      const mixedExclude = excludeFor('C:/Users/dev/app');
      expect(mixedExclude.test('C:/Users/dev/app\\node_modules\\pkg\\index.test.js')).toBe(true);
      expect(mixedExclude.test('C:/Users/dev/app\\imports\\thing.test.js')).toBe(false);
    });

    test('keeps app test files when a parent folder is named private', () => {
      const privateExclude = excludeFor('C:\\Users\\dev\\private\\app');
      expect(privateExclude.test('C:\\Users\\dev\\private\\app\\imports\\thing.test.js')).toBe(false);
    });
  });

  describe('without a root path', () => {
    test('matches relative context keys', () => {
      const exclude = createIgnoreRegex(createIgnoreGlobConfig(['tests/fixtures/**']));
      expect(exclude.test('./tests/fixtures/thing.test.js')).toBe(true);
      expect(exclude.test('./imports/thing.test.js')).toBe(false);
    });

    test('keeps a single star within one path segment', () => {
      const exclude = createIgnoreRegex(createIgnoreGlobConfig(['imports/*.test.js']));
      expect(exclude.test('./imports/thing.test.js')).toBe(true);
      expect(exclude.test('./imports/nested/thing.test.js')).toBe(false);
    });

    test('never matches when every pattern is a negation', () => {
      const exclude = createIgnoreRegex(createIgnoreGlobConfig(['!imports/**']));
      expect(exclude.test('./imports/thing.test.js')).toBe(false);
    });
  });

  test('survives being embedded as a regex literal in generated code', () => {
    const exclude = excludeFor('C:\\Users\\dev\\app');
    const embedded = new Function(`return ${exclude.toString()};`)();
    expect(embedded.test('C:\\Users\\dev\\app\\node_modules\\pkg\\index.test.js')).toBe(true);
    expect(embedded.test('C:\\Users\\dev\\app\\imports\\thing.test.js')).toBe(false);
  });
});
