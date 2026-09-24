const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createIgnoreGlobConfig,
  createIgnoreMatcherSource,
  createIgnoreRegex,
  getMeteorIgnoreEntries,
} = require('./ignore.js');

// Compiles the factory emitted into the generated eager-test module and wires
// it to the same `ignore` module that module imports, so the assertions below
// exercise the exact code that runs inside the bundle.
const compileMatcher = entries => {
  const { modulePath, source } = createIgnoreMatcherSource(entries);

  // eslint-disable-next-line no-new-func -- the input is this package's own
  // generated source, not user data.
  return new Function('createIgnore', `return (${source})(createIgnore);`)(
    require(modulePath),
  );
};

const withMeteorIgnoreEnv = (value, fn) => {
  const previous = process.env.METEOR_IGNORE;
  if (value === undefined) {
    delete process.env.METEOR_IGNORE;
  } else {
    process.env.METEOR_IGNORE = value;
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.METEOR_IGNORE;
    } else {
      process.env.METEOR_IGNORE = previous;
    }
  }
};

describe('createIgnoreMatcherSource', () => {
  test('re-includes a file a later negation pattern rescues', () => {
    const isIgnored = compileMatcher([
      '*.tests.ts',
      '!/imports/localization/LanguageSections.tests.ts',
    ]);

    expect(isIgnored('./imports/localization/LanguageSections.tests.ts')).toBe(
      false,
    );
  });

  test('still ignores files no negation pattern rescues', () => {
    const isIgnored = compileMatcher([
      '*.tests.ts',
      '!/imports/localization/LanguageSections.tests.ts',
    ]);

    expect(isIgnored('./imports/localization/Other.tests.ts')).toBe(true);
  });

  test('lets the last matching pattern win when a positive follows a negation', () => {
    const isIgnored = compileMatcher([
      '*.tests.ts',
      '!/imports/a/B.tests.ts',
      '/imports/a/',
    ]);

    expect(isIgnored('./imports/a/B.tests.ts')).toBe(true);
  });

  test('ignores nothing when every pattern is a negation', () => {
    const isIgnored = compileMatcher(['!/imports/a/B.tests.ts']);

    expect(isIgnored('./imports/a/B.tests.ts')).toBe(false);
  });

  test('returns null when there are no patterns', () => {
    expect(createIgnoreMatcherSource([])).toBeNull();
  });

  test('anchors a rooted pattern to the project root', () => {
    const isIgnored = compileMatcher(['/imports/a.tests.ts']);

    expect(isIgnored('./imports/a.tests.ts')).toBe(true);
    expect(isIgnored('./packages/imports/a.tests.ts')).toBe(false);
  });

  test('supports character classes', () => {
    const isIgnored = compileMatcher(['shard-[a-c].tests.ts']);

    expect(isIgnored('./imports/shard-b.tests.ts')).toBe(true);
    expect(isIgnored('./imports/shard-d.tests.ts')).toBe(false);
  });

  test('supports the single-character wildcard', () => {
    const isIgnored = compileMatcher(['shard-?.tests.ts']);

    expect(isIgnored('./imports/shard-1.tests.ts')).toBe(true);
    expect(isIgnored('./imports/shard-12.tests.ts')).toBe(false);
  });

  test('matches a **/ pattern at the project root too', () => {
    const isIgnored = compileMatcher(['**/legacy.tests.ts']);

    expect(isIgnored('./legacy.tests.ts')).toBe(true);
    expect(isIgnored('./imports/legacy.tests.ts')).toBe(true);
  });

  test('does not let a negation rescue a file under an excluded directory', () => {
    const isIgnored = compileMatcher(['/imports/', '!/imports/a.tests.ts']);

    expect(isIgnored('./imports/a.tests.ts')).toBe(true);
  });
});

describe('createIgnoreRegex', () => {
  test('matches paths covered by a positive pattern', () => {
    const regex = createIgnoreRegex(createIgnoreGlobConfig(['node_modules/']));

    expect(regex.test('./node_modules/foo/index.js')).toBe(true);
    expect(regex.test('./imports/a.js')).toBe(false);
  });
});

describe('getMeteorIgnoreEntries', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-ignore-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('appends METEOR_IGNORE patterns after the .meteorignore ones', () => {
    fs.writeFileSync(
      path.join(projectDir, '.meteorignore'),
      '# comment\n*.tests.ts\n\n',
    );

    const entries = withMeteorIgnoreEnv(
      '!/imports/a/B.tests.ts  /imports/c',
      () => getMeteorIgnoreEntries(projectDir),
    );

    expect(entries).toEqual([
      '*.tests.ts',
      '!/imports/a/B.tests.ts',
      '/imports/c',
    ]);
  });

  test('returns METEOR_IGNORE patterns when there is no .meteorignore file', () => {
    const entries = withMeteorIgnoreEnv('*.tests.ts', () =>
      getMeteorIgnoreEntries(projectDir),
    );

    expect(entries).toEqual(['*.tests.ts']);
  });

  test('returns an empty array when neither source has patterns', () => {
    const entries = withMeteorIgnoreEnv(undefined, () =>
      getMeteorIgnoreEntries(projectDir),
    );

    expect(entries).toEqual([]);
  });
});
