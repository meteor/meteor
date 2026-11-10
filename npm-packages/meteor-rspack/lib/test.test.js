const fs = require('fs');
const os = require('os');
const path = require('path');

const { createIgnoreMatcherSource } = require('./ignore.js');
const { generateEagerTestFile } = require('./test.js');

describe('generateEagerTestFile', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-eager-test-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const generate = meteorIgnoreEntries =>
    fs.readFileSync(
      generateEagerTestFile({
        isAppTest: false,
        projectDir,
        buildContext: '_build',
        meteorIgnoreEntries,
      }),
      'utf8',
    );

  test('filters test files through a matcher built from the ignore package', () => {
    const entries = ['*.tests.ts', '!/imports/a/B.tests.ts'];
    const { modulePath, source } = createIgnoreMatcherSource(entries);

    const content = generate(entries);

    expect(content).toContain(
      `import MeteorIgnore from '${modulePath.replace(/\\/g, '/')}';`,
    );
    expect(content).toContain(source);
    expect(content).toContain('!MeteorIgnoreMatcher(k)');
  });

  test('keeps every test file when there are no meteor ignore entries', () => {
    const content = generate([]);

    expect(content).not.toContain('MeteorIgnore');
    expect(content).toContain('return true;');
  });
});
