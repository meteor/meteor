const assert = require('node:assert/strict');
const test = require('node:test');

const {
  appendTransformPlugins,
  selectTestSourceTransforms,
} = require('./test-runner-transforms.js');

function sourceTransforms(overrides = {}) {
  return {
    includePackages: ['local:cards'],
    packageRoots: { 'local:cards': '/workspace/packages/cards' },
    swcPlugins: [[
      '/plugins/coverage.wasm',
      { unstableExclude: ['**/*.test.js'] },
    ]],
    babelPlugins: [[
      '/plugins/instrument.js',
      { cwd: '/workspace' },
    ]],
    cacheKey: 'coverage-v1',
    ...overrides,
  };
}

test('ignores absent test-runner source transforms', () => {
  const selected = selectTestSourceTransforms({
    packageName: 'local:cards',
    options: undefined,
  });

  assert.equal(selected, null);
});

test('ignores app files and packages outside the exact whitelist', () => {
  const options = sourceTransforms();

  assert.equal(selectTestSourceTransforms({ packageName: null, options }), null);
  assert.equal(
    selectTestSourceTransforms({ packageName: 'published:cards', options }),
    null,
  );
  assert.equal(
    selectTestSourceTransforms({ packageName: 'local:cards-extra', options }),
    null,
  );
});

test('selects provider transforms only for whitelisted package inputs', () => {
  const selected = selectTestSourceTransforms({
    packageName: 'local:cards',
    options: sourceTransforms(),
  });

  assert.equal(selected.packageRoot, '/workspace/packages/cards');
  assert.equal(selected.cacheKey, 'coverage-v1');
  assert.deepEqual(selected.swcPlugins, [[
    '/plugins/coverage.wasm',
    { unstableExclude: ['**/*.test.js'] },
  ]]);
  assert.deepEqual(selected.babelPlugins, [[
    '/plugins/instrument.js',
    { cwd: '/workspace' },
  ]]);
});

test('rejects selected transforms with relative package or plugin paths', () => {
  assert.equal(selectTestSourceTransforms({
    packageName: 'local:cards',
    options: sourceTransforms({
      packageRoots: { 'local:cards': 'packages/cards' },
    }),
  }), null);

  assert.equal(selectTestSourceTransforms({
    packageName: 'local:cards',
    options: sourceTransforms({
      babelPlugins: [['plugins/instrument.js', { cwd: '/workspace' }]],
    }),
  }), null);
});

test('selects Windows absolute package and plugin paths without accepting drive-relative paths', () => {
  const selected = selectTestSourceTransforms({
    packageName: 'local:cards',
    options: sourceTransforms({
      packageRoots: { 'local:cards': 'C:\\workspace\\packages\\cards' },
      swcPlugins: [[
        'C:\\plugins\\coverage.wasm',
        { unstableExclude: ['**/*.test.js'] },
      ]],
      babelPlugins: [['C:\\plugins\\instrument.js', { cwd: 'C:\\workspace' }]],
    }),
  });

  assert.equal(selected.packageRoot, 'C:\\workspace\\packages\\cards');
  assert.deepEqual(selected.babelPlugins, [[
    'C:\\plugins\\instrument.js',
    { cwd: 'C:\\workspace' },
  ]]);
  assert.equal(selectTestSourceTransforms({
    packageName: 'local:cards',
    options: sourceTransforms({
      packageRoots: { 'local:cards': 'C:workspace\\packages\\cards' },
    }),
  }), null);
});

test('rejects selected transforms with non-JSON plugin options', () => {
  assert.equal(selectTestSourceTransforms({
    packageName: 'local:cards',
    options: sourceTransforms({
      babelPlugins: [['/plugins/instrument.js', { rewrite() {} }]],
    }),
  }), null);
});

test('fingerprints equivalent transforms deterministically and changes for plugin options', () => {
  const selected = selectTestSourceTransforms({
    packageName: 'local:cards',
    options: sourceTransforms({
      babelPlugins: [['/plugins/instrument.js', { cwd: '/workspace', compact: false }]],
    }),
  });
  const reordered = selectTestSourceTransforms({
    packageName: 'local:cards',
    options: sourceTransforms({
      babelPlugins: [['/plugins/instrument.js', { compact: false, cwd: '/workspace' }]],
    }),
  });
  const changed = selectTestSourceTransforms({
    packageName: 'local:cards',
    options: sourceTransforms({
      babelPlugins: [['/plugins/instrument.js', { cwd: '/workspace', compact: true }]],
    }),
  });

  assert.match(selected.cacheFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(reordered.cacheFingerprint, selected.cacheFingerprint);
  assert.notEqual(changed.cacheFingerprint, selected.cacheFingerprint);
});

test('projects transform plugins to Babel and SWC without duplicate entries', () => {
  const transform = {
    swcPlugins: [[
      '/plugins/coverage.wasm',
      { unstableExclude: ['**/*.test.js'] },
    ]],
    babelPlugins: [[
      '/plugins/instrument.js',
      { cwd: '/workspace' },
    ]],
  };
  const swcOptions = {
    jsc: {
      experimental: {
        plugins: [[
          '/plugins/coverage.wasm',
          { unstableExclude: ['**/*.test.js'] },
        ]],
      },
    },
  };
  const babelOptions = {
    plugins: [['/plugins/user.js', { loose: true }]],
  };

  appendTransformPlugins(swcOptions, 'swc', transform);
  appendTransformPlugins(babelOptions, 'babel', transform);
  appendTransformPlugins(babelOptions, 'babel', transform);

  assert.deepEqual(swcOptions.jsc.experimental.plugins, [[
    '/plugins/coverage.wasm',
    { unstableExclude: ['**/*.test.js'] },
  ]]);
  assert.deepEqual(babelOptions.plugins, [
    ['/plugins/user.js', { loose: true }],
    ['/plugins/instrument.js', { cwd: '/workspace' }],
  ]);
});

test('leaves options unchanged when no transform is selected', () => {
  const options = { plugins: [['/plugins/user.js', { loose: true }]] };

  const returned = appendTransformPlugins(options, 'babel', null);

  assert.equal(returned, options);
  assert.deepEqual(options, {
    plugins: [['/plugins/user.js', { loose: true }]],
  });
});

test('exposes selector and applicator through the build-plugin global', () => {
  const previousPlugin = globalThis.Plugin;
  globalThis.Plugin = {
    getTestRunnerBuildOptions() {
      return { sourceTransforms: sourceTransforms() };
    },
  };

  try {
    const transform = globalThis.BabelTestRunnerTransforms.forInput({
      getPackageName() {
        return 'local:cards';
      },
    });
    const options = { plugins: [] };
    globalThis.BabelTestRunnerTransforms.apply(options, 'babel', transform);

    assert.equal(transform.packageRoot, '/workspace/packages/cards');
    assert.deepEqual(options.plugins, [[
      '/plugins/instrument.js',
      { cwd: '/workspace' },
    ]]);
  } finally {
    if (previousPlugin === undefined) {
      delete globalThis.Plugin;
    } else {
      globalThis.Plugin = previousPlugin;
    }
  }
});
