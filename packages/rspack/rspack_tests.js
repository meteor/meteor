// Regression tests for the METEOR_IGNORE extension list.
//
// Symptom being guarded against: the ignore-extension computation used to
// glob the entire project tree ('**/*') on every config build to enumerate
// the extensions present. On large Blaze/Less/SCSS projects that walk was
// O(files) per build and expanded METEOR_IGNORE (directories x extensions)
// past 30KB, an oversized environment that every child spawn then inherited,
// risking E2BIG on execve. The computation must stay a pure function of the
// project's compiler flags: bounded, deterministic, and independent of
// whatever files (or exotic extensions) happen to exist on disk.
const {
  CODE_EXTENSIONS_TO_IGNORE,
  getCodeExtensionsToIgnore,
} = require('./lib/extensions.js');

Tinytest.add(
  'rspack - ignore extensions - list is static, bounded, and well-formed',
  test => {
    // Bounded: a fixed list, not an enumeration of the project tree. If this
    // grows past the bound, something is feeding filesystem contents back in.
    test.isTrue(
      CODE_EXTENSIONS_TO_IGNORE.length > 0 &&
        CODE_EXTENSIONS_TO_IGNORE.length <= 32,
      `expected a small static list, got ${CODE_EXTENSIONS_TO_IGNORE.length} entries`,
    );

    // Well-formed: '.ext', lowercase, no empty or duplicate entries.
    CODE_EXTENSIONS_TO_IGNORE.forEach(ext => {
      test.isTrue(
        /^\.[a-z0-9]+$/.test(ext),
        `malformed extension entry: ${JSON.stringify(ext)}`,
      );
    });
    test.equal(
      new Set(CODE_EXTENSIONS_TO_IGNORE).size,
      CODE_EXTENSIONS_TO_IGNORE.length,
      'duplicate entries in extension list',
    );
  },
);

Tinytest.add(
  'rspack - ignore extensions - result does not depend on directory contents',
  test => {
    // Pure-function contract: same flags, same result, every time. The old
    // implementation returned different lists depending on which files
    // existed in the tree at the moment of the scan.
    const first = getCodeExtensionsToIgnore({ isBlazeProject: true });
    const second = getCodeExtensionsToIgnore({ isBlazeProject: true });
    test.equal(first, second);

    // Code extensions rspack always owns must be present in every variant.
    [
      {},
      { isBlazeProject: true },
      { isLessProject: true },
      { isScssProject: true },
      { isBlazeProject: true, isLessProject: true, isScssProject: true },
    ].forEach(flags => {
      const exts = getCodeExtensionsToIgnore(flags);
      ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json'].forEach(ext => {
        test.include(exts, ext);
      });
    });
  },
);

Tinytest.add(
  'rspack - ignore extensions - compiler-owned extensions stay visible to Meteor',
  test => {
    // Blaze owns .html; everything else stays ignored.
    const blaze = getCodeExtensionsToIgnore({ isBlazeProject: true });
    test.isFalse(blaze.includes('.html'), 'Blaze projects must not ignore .html');
    test.include(blaze, '.less');
    test.include(blaze, '.scss');
    test.include(blaze, '.css');

    // Less owns .less.
    const less = getCodeExtensionsToIgnore({ isLessProject: true });
    test.isFalse(less.includes('.less'), 'Less projects must not ignore .less');
    test.include(less, '.html');
    test.include(less, '.scss');

    // SCSS owns both syntaxes, .scss and .sass.
    const scss = getCodeExtensionsToIgnore({ isScssProject: true });
    test.isFalse(scss.includes('.scss'), 'SCSS projects must not ignore .scss');
    test.isFalse(scss.includes('.sass'), 'SCSS projects must not ignore .sass');
    test.include(scss, '.html');
    test.include(scss, '.less');

    // All compilers active: each owned extension excluded, the rest intact.
    const all = getCodeExtensionsToIgnore({
      isBlazeProject: true,
      isLessProject: true,
      isScssProject: true,
    });
    ['.html', '.less', '.scss', '.sass'].forEach(ext => {
      test.isFalse(all.includes(ext), `${ext} must stay visible to Meteor`);
    });
    test.include(all, '.css');
    test.include(all, '.js');
  },
);

Tinytest.add(
  'rspack - ignore extensions - returns a fresh array each call',
  test => {
    // Callers concat/spread the result into METEOR_IGNORE pattern lists;
    // handing out the module-level array by reference would let one call
    // site's mutation leak into the next build.
    const a = getCodeExtensionsToIgnore({});
    a.push('.mutated');
    const b = getCodeExtensionsToIgnore({});
    test.isFalse(b.includes('.mutated'));
    test.isFalse(CODE_EXTENSIONS_TO_IGNORE.includes('.mutated'));
  },
);
