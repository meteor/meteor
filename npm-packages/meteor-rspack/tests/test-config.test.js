const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const test = require('node:test');

const { createTestRspackConfig } = require('../config.js');
const {
  appendMeteorModuleMockGuard,
  createMeteorRstestPlugins,
  enforceMeteorRstestPlugins,
} = require('../lib/rstest-runtime.js');
const {
  createRstestRuntimeAlias,
  createRstestTestFileRegistration,
  enforceRstestRuntimeAlias,
  enforceRstestRuntimeOptimization,
  generateEagerTestFile,
} = require('../lib/test.js');

test('server test projection uses same Rspack SWC and resolver language', () => {
  const root = path.resolve('/tmp/meteor-rspack-projection');
  const config = createTestRspackConfig({
    root,
    target: 'node',
    typescript: true,
    jsx: true,
    aliases: { 'meteor/meteor': path.join(root, 'tests/mock-meteor.js') },
  });

  assert.equal(config.context, root);
  assert.equal(config.target, 'node');
  assert.equal(config.devtool, 'source-map');
  assert.deepEqual(config.resolve.extensions, [
    '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.wasm',
  ]);
  assert.equal(config.module.rules[0].loader, 'builtin:swc-loader');
  assert.equal(
    config.resolve.alias['meteor/meteor'],
    path.join(root, 'tests/mock-meteor.js'),
  );
  assert.equal(config.module.rules[0].options.jsc.parser.syntax, 'typescript');
  assert.equal(config.module.rules[1].type, 'css/auto');
  assert.equal(config.module.rules[2].type, 'asset/resource');
  assert.equal(config.plugins[0].constructor.name, 'DefinePlugin');
  assert.equal(config.module.rules[0].options.jsc.parser.tsx, true);
  assert.equal(config.module.parser.javascript.exportsPresence, 'warn');
  assert.deepEqual(config.externalsPresets, { node: true });
});

test('browser test projection does not externalize Meteor packages', () => {
  const config = createTestRspackConfig({ root: '/tmp/app', target: 'web' });

  assert.equal(config.externals.length, 1);
  assert.equal(config.externalsPresets, undefined);
  assert.equal(config.module.rules[0].options.jsc.parser.syntax, 'ecmascript');
  assert.equal(config.resolve.fallback.fs, false);
});

test('pure projection rejects transitive Meteor runtime requests with project guidance', async () => {
  const config = createTestRspackConfig({ root: '/tmp/app', target: 'node' });
  const error = await new Promise(resolve => {
    config.externals[0]({
      request: 'meteor/mongo',
      contextInfo: { issuer: '/tmp/app/domain.js' },
    }, resolve);
  });
  assert.equal(error.code, 'RSTEST_RUNTIME_PROJECT_REQUIRED');
  assert.match(error.message, /tests\/rstest\/runtime/);
  assert.match(error.message, /domain\.js/);
});

test('Meteor eager entry excludes every native Rstest-owned root', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-eager-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'private', 'app');
  fs.mkdirSync(projectRoot, { recursive: true });
  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    buildContext: '_build',
    ignoreEntries: ['**/tests/legacy/**'],
  });
  const content = fs.readFileSync(generated, 'utf8');
  const match = content.match(/exclude: (\/.*\/[gimyus]*),\n/);
  assert.ok(match, 'generated entry contains executable exclusion regex');
  const exclusion = Function(`return ${match[1]}`)();

  for (const testPath of [
    'tests/rstest/pure/server/math.test.js',
    'tests/rstest/pure/client/dom.test.js',
    'tests/rstest/browser/component.test.js',
    'tests/rstest/e2e/app.test.js',
  ]) {
    const absolutePath = path.join(projectRoot, testPath);
    assert.equal(exclusion.test(absolutePath), true, `${testPath} remains Rstest-owned`);
  }
  assert.equal(
    exclusion.test(path.join(projectRoot, 'tests/rstest/runtime/server/mongo.test.js')),
    false,
    'ignore-looking segments above project root do not exclude app tests',
  );
  assert.equal(
    exclusion.test(path.join(projectRoot, 'private/secret.test.js')),
    true,
    'private app directory remains excluded',
  );
  assert.equal(
    exclusion.test(path.join(projectRoot, 'packages/local-fixture/fixture.tests.js')),
    true,
    'Package.onTest sources remain owned by meteor test-packages',
  );
  assert.equal(
    exclusion.test(path.join(projectRoot, 'tests/legacy/mocha.tests.js')),
    true,
    'legacy compatibility files can remain owned by actual driver runtimes',
  );
});

test('Rstest runtime eager entry scans only its deterministic Meteor root', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-root-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/rstest/runtime/server');
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    testFileRoot: '',
    buildContext: '_build',
  });
  const content = fs.readFileSync(generated, 'utf8');

  assert.equal(
    content.includes(`webpackContext('${runtimeRoot.replace(/\\/g, '/')}'`),
    true,
  );
  assert.equal(
    content.includes(`webpackContext('${projectRoot.replace(/\\/g, '/')}'`),
    false,
  );
});

test('Rstest runtime eager entry can compile an exact CLI-selected file', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-file-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/rstest/runtime/server');
  const selected = path.join(runtimeRoot, 'selected.test.js');
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    includeFiles: [selected],
    buildContext: '_build',
  });
  const content = fs.readFileSync(generated, 'utf8');

  assert.equal(content.includes('selected\\.test\\.js'), true);
  assert.equal(content.includes('unselected.test.js'), false);
});

test('Rstest runtime eager entry registers app-relative source files', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-register-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/rstest/runtime/server');
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    buildContext: '_build',
    testFileRegistration: {
      module: 'meteor/rstest',
      exportName: '__registerTestFileLoader',
    },
  });
  const content = fs.readFileSync(generated, 'utf8');

  assert.match(
    content,
    /import \{ __registerTestFileLoader as __meteorRegisterTestFile \} from "meteor\/rstest";/,
  );
  assert.match(
    content,
    /const __meteorTestFileRoot = "tests\/rstest\/runtime\/server";/,
  );
  assert.match(content, /__meteorRegisterTestFile\(/);
  assert.match(content, /\(\) => ctx\(file\)/);
  assert.match(content, /mode: 'sync'/);
});

test('Rstest package entry registers files relative to external discovery root', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-package-register-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'source-app');
  const runtimeRoot = path.join(root, 'package-runtime');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    buildContext: '_build',
    testFileRegistration: {
      module: 'meteor/rstest',
      exportName: '__registerTestFileLoader',
    },
  });
  const content = fs.readFileSync(generated, 'utf8');

  assert.match(content, /const __meteorTestFileRoot = "";/);
  assert.doesNotMatch(content, /__meteorTestFileRoot = "\.\./);
});

test('Rstest runtime entry loads isolated setup modules before each test file', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-setup-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/rstest/runtime/server');
  const setupFile = path.join(projectRoot, 'tests/setup.js');
  const first = path.join(runtimeRoot, 'first.test.js');
  const second = path.join(runtimeRoot, 'second.test.js');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(path.dirname(setupFile), { recursive: true });
  fs.writeFileSync(setupFile, '');

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    includeFiles: [first, second],
    setupFiles: [setupFile],
    buildContext: '_build',
    testFileRegistration: {
      module: 'meteor/rstest',
      exportName: '__registerTestFileLoader',
    },
  });
  const content = fs.readFileSync(generated, 'utf8');

  assert.match(content, /meteor-rstest-setup=first\.test\.js%3A0/);
  assert.match(content, /meteor-rstest-setup=second\.test\.js%3A0/);
  assert.match(content, /pending\.then\(loadSetup\)/);
  assert.match(content, /\.then\(\(\) => ctx\(file\)\)/);
});

test('Rstest upstream runtime entry registers deferred app-relative loaders', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-lazy-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/rstest/runtime/server');
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    buildContext: '_build',
    testFileRegistration: {
      module: 'meteor/rstest',
      exportName: '__registerTestFileLoader',
      mode: 'sync',
      runtimeFactory: {
        module: '@meteorjs/rstest/runtime',
        exportName: 'createMeteorRstestFileRuntime',
        registrationExportName: '__setRstestRuntimeFactory',
      },
    },
  });
  const content = fs.readFileSync(generated, 'utf8');

  assert.match(
    content,
    /import \{ __registerTestFileLoader as __meteorRegisterTestFile, __setRstestRuntimeFactory as __meteorSetRstestRuntimeFactory \} from "meteor\/rstest";/,
  );
  assert.match(
    content,
    /import \{ createMeteorRstestFileRuntime as __meteorCreateRstestRuntime \} from "@meteorjs\/rstest\/runtime";/,
  );
  assert.match(
    content,
    /__meteorSetRstestRuntimeFactory\(__meteorCreateRstestRuntime\);/,
  );
  assert.match(content, /__meteorRegisterTestFile\(/);
  assert.match(content, /\(\) => ctx\(file\)/);
  assert.match(content, /mode: 'sync'/);
});

test('unified Rstest runtime selects deferred loader registration only for Rstest builds', () => {
  assert.deepEqual(
    createRstestTestFileRegistration({
      isRstestTest: true,
    }),
    {
      module: 'meteor/rstest',
      exportName: '__registerTestFileLoader',
      mode: 'sync',
      runtimeFactory: {
        module: '@meteorjs/rstest/runtime',
        exportName: 'createMeteorRstestFileRuntime',
        registrationExportName: '__setRstestRuntimeFactory',
      },
    },
  );
  assert.equal(
    createRstestTestFileRegistration({
      isRstestTest: false,
    }),
    undefined,
  );
});

test('Rstest upstream runtime alias resolves from harness and overrides user alias', () => {
  const resolutions = [];
  const alias = createRstestRuntimeAlias({
    upstreamRuntime: true,
    projectDir: '/meteor-app',
    npmRoot: '/meteor-harness',
    resolveModule(request, options) {
      resolutions.push({ request, options });
      return request === '@meteorjs/rstest/runtime'
        ? '/meteor-harness/node_modules/@meteorjs/rstest/src/runtime/index.js'
        : '/meteor-harness/node_modules/@rstest/core/dist/browser-runtime/index.js';
    },
  });

  assert.deepEqual(resolutions, [
    {
      request: '@rstest/core/internal/browser-runtime',
      options: { paths: ['/meteor-harness', '/meteor-app'] },
    },
    {
      request: '@meteorjs/rstest/runtime',
      options: { paths: ['/meteor-harness', '/meteor-app'] },
    },
  ]);
  assert.deepEqual(alias, {
    '@rstest/core$': '/meteor-harness/node_modules/@rstest/core/dist/browser-runtime/index.js',
    '@meteorjs/rstest/runtime$':
      '/meteor-harness/node_modules/@meteorjs/rstest/src/runtime/index.js',
  });

  const config = { resolve: { alias: { '@rstest/core$': '/user/wrong.js' } } };
  enforceRstestRuntimeAlias(config, alias);
  assert.deepEqual(config.resolve.alias, alias);
  assert.equal(createRstestRuntimeAlias({ upstreamRuntime: false }), undefined);

  const optimized = {
    optimization: { usedExports: true, minimize: true, sideEffects: true },
  };
  enforceRstestRuntimeOptimization(optimized, true);
  assert.deepEqual(optimized.optimization, {
    usedExports: false,
    minimize: false,
    concatenateModules: false,
    sideEffects: true,
  });
  assert.equal(optimized.mode, 'development');
});

test('Meteor Rstest compiler plugins preserve upstream transforms after user config', () => {
  class RstestPlugin {
    constructor(options) {
      this.options = options;
    }
  }
  const plugins = createMeteorRstestPlugins({
    upstreamRuntime: true,
    projectDir: '/meteor-app',
    runtimeCodePath: '/rstest/mockRuntimeCode.js',
    rspack: { experiments: { RstestPlugin } },
  });

  assert.equal(plugins.length, 2);
  assert.deepEqual(plugins[0].options, {
    injectModulePathName: true,
    importMetaPathName: true,
    hoistMockModule: true,
    manualMockRoot: '/meteor-app/__mocks__',
  });
  assert.equal(plugins[1].runtimeCodePath, '/rstest/mockRuntimeCode.js');

  const config = { plugins: [{ constructor: { name: 'UserPlugin' } }] };
  enforceMeteorRstestPlugins(config, plugins);
  enforceMeteorRstestPlugins(config, plugins);
  assert.deepEqual(config.plugins, [
    { constructor: { name: 'UserPlugin' } },
    ...plugins,
  ]);
  assert.deepEqual(
    createMeteorRstestPlugins({ upstreamRuntime: false }),
    [],
  );
});

test('Meteor Rstest mock runtime blocks Meteor-owned module replacement', () => {
  const runtime = appendMeteorModuleMockGuard('UPSTREAM_RUNTIME');

  assert.match(runtime, /UPSTREAM_RUNTIME/);
  assert.match(runtime, /METEOR_RSTEST_ATMOSPHERE_MOCK_UNSUPPORTED/);
  assert.match(runtime, /meteor\\\//);
  assert.match(runtime, /rstest_mock/);
  assert.match(runtime, /rstest_import_actual/);
});

test('ordinary Meteor eager entry does not register Rstest source files', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-plain-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(projectRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    buildContext: '_build',
  });
  const content = fs.readFileSync(generated, 'utf8');

  assert.doesNotMatch(content, /__meteorRegisterTestFile/);
  assert.match(content, /\.forEach\(ctx\)/);
  assert.match(content, /mode: 'eager'/);
});

test('eager entry follows isolated Meteor local directory', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-local-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const localDir = path.join(projectRoot, '.meteor', 'local-server-2');

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    localDir,
    buildContext: '_build-local-server-2',
  });

  assert.equal(
    generated,
    path.join(localDir, 'test', 'eager-tests.mjs'),
  );
});
