const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const { rspack } = require('@rspack/core');
const { createMeteorSwcRule, createTestRspackConfig } = require('../config.js');
const { generateEagerTestFile } = require('../lib/test.js');

test('SWC preserves Rspack root imports and symlink-relative resolution', {
  skip: process.platform === 'win32', // File symlinks require developer mode or elevation.
}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-symlink-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'app'));
  fs.mkdirSync(path.join(root, 'shared'));
  fs.writeFileSync(path.join(root, 'shared/file.ts'), 'export { value } from "./peer";');
  fs.writeFileSync(path.join(root, 'app/peer.ts'), 'export const value: number = 42;');
  fs.symlinkSync('../shared/file.ts', path.join(root, 'app/file.ts'));
  fs.writeFileSync(path.join(root, 'app/main.ts'), `
    export { value as rooted } from '/app/file';
    export { value as relative } from './file';
  `);

  const compiler = rspack({
    mode: 'development',
    context: root,
    target: 'node',
    entry: './app/main.ts',
    output: { path: path.join(root, 'out'), library: { type: 'commonjs2' } },
    resolve: { extensions: ['.ts', '.js'], roots: [root], symlinks: false },
    module: { rules: [createMeteorSwcRule({ root, isTypescriptEnabled: true })] },
  });
  try {
    const stats = await new Promise((resolve, reject) => {
      compiler.run((error, result) => error ? reject(error) : resolve(result));
    });
    assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
    const result = require(path.join(root, 'out/main.js'));
    assert.equal(result.rooted, 42);
    assert.equal(result.relative, 42);
  } finally {
    await new Promise((resolve, reject) => {
      compiler.close(error => error ? reject(error) : resolve());
    });
  }
});

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
  assert.equal(error.code, 'METEOR_TEST_RUNTIME_REQUIRED');
  assert.match(error.message, /Meteor host/);
  assert.match(error.message, /domain\.js/);
});

test('Meteor eager entry respects caller-supplied exclusions', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-eager-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'private', 'app');
  fs.mkdirSync(projectRoot, { recursive: true });
  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    buildContext: '_build',
    ignoreEntries: ['**/tests/legacy/**', '**/tests/provider/native/**'],
  });
  execFileSync(process.execPath, ['--check', generated]);
  const content = fs.readFileSync(generated, 'utf8');
  const match = content.match(/exclude: (\/.*\/[gimyus]*),\n/);
  assert.ok(match, 'generated entry contains executable exclusion regex');
  const exclusion = Function(`return ${match[1]}`)();

  for (const testPath of [
    'tests/provider/native/server/math.test.js',
    'tests/provider/native/client/dom.test.js',
    'tests/provider/native/browser/component.test.js',
    'tests/provider/native/e2e/app.test.js',
  ]) {
    const absolutePath = path.join(projectRoot, testPath);
    assert.equal(exclusion.test(absolutePath), true, `${testPath} remains TestRunner-owned`);
  }
  assert.equal(
    exclusion.test(path.join(projectRoot, 'tests/test-runner/runtime/server/mongo.test.js')),
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

test('TestRunner runtime eager entry scans only its deterministic Meteor root', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-root-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/test-runner/runtime/server');
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    testFileRoot: '',
    buildContext: '_build',
  });
  execFileSync(process.execPath, ['--check', generated]);
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

test('TestRunner runtime eager entry can compile an exact CLI-selected file', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-file-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/test-runner/runtime/server');
  const selected = path.join(runtimeRoot, 'selected.test.js');
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    includeFiles: [selected],
    buildContext: '_build',
  });
  execFileSync(process.execPath, ['--check', generated]);
  const content = fs.readFileSync(generated, 'utf8');

  assert.equal(content.includes('selected\\.test\\.js'), true);
  assert.equal(content.includes('unselected.test.js'), false);
});

test('TestRunner runtime eager entry registers app-relative source files', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-register-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/test-runner/runtime/server');
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    buildContext: '_build',
    testFileRegistration: {
      module: 'meteor/test-runner',
      exportName: '__registerTestFileLoader',
    },
  });
  execFileSync(process.execPath, ['--check', generated]);
  const content = fs.readFileSync(generated, 'utf8');

  assert.match(
    content,
    /import \{ __registerTestFileLoader as __meteorRegisterTestFile \} from "meteor\/test-runner";/,
  );
  assert.match(
    content,
    /const __meteorTestFileRoot = "tests\/test-runner\/runtime\/server";/,
  );
  assert.match(content, /__meteorRegisterTestFile\(/);
  assert.match(content, /\(\) => ctx\(file\)/);
  assert.match(content, /mode: 'sync'/);
});

test('TestRunner package entry registers files relative to external discovery root', t => {
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
      module: 'meteor/test-runner',
      exportName: '__registerTestFileLoader',
    },
  });
  execFileSync(process.execPath, ['--check', generated]);
  const content = fs.readFileSync(generated, 'utf8');

  assert.match(content, /const __meteorTestFileRoot = "";/);
  assert.doesNotMatch(content, /__meteorTestFileRoot = "\.\./);
});

test('TestRunner runtime entry loads isolated setup modules before each test file', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-setup-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/test-runner/runtime/server');
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
      module: 'meteor/test-runner',
      exportName: '__registerTestFileLoader',
    },
  });
  execFileSync(process.execPath, ['--check', generated]);
  const content = fs.readFileSync(generated, 'utf8');

  assert.match(content, /meteor-test-setup=first\.test\.js%3A0/);
  assert.match(content, /meteor-test-setup=second\.test\.js%3A0/);
  assert.match(content, /pending\.then\(loadSetup\)/);
  assert.match(content, /\.then\(\(\) => ctx\(file\)\)/);
});

test('TestRunner upstream runtime entry registers deferred app-relative loaders', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-lazy-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(projectRoot, 'tests/test-runner/runtime/server');
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    discoveryRoot: runtimeRoot,
    buildContext: '_build',
    testFileRegistration: {
      module: 'meteor/test-runner',
      exportName: '__registerTestFileLoader',
      mode: 'sync',
      runtimeFactory: {
        module: '@meteorjs/test-runner/runtime',
        exportName: 'createMeteorTestRunnerFileRuntime',
        registrationExportName: '__setTestRunnerRuntimeFactory',
      },
    },
  });
  execFileSync(process.execPath, ['--check', generated]);
  const content = fs.readFileSync(generated, 'utf8');

  assert.match(
    content,
    /import \{ __registerTestFileLoader as __meteorRegisterTestFile, __setTestRunnerRuntimeFactory as __meteorSetTestRuntimeFactory \} from "meteor\/test-runner";/,
  );
  assert.match(
    content,
    /import \{ createMeteorTestRunnerFileRuntime as __meteorCreateTestRuntime \} from "@meteorjs\/test-runner\/runtime";/,
  );
  assert.match(
    content,
    /__meteorSetTestRuntimeFactory\(__meteorCreateTestRuntime\);/,
  );
  assert.match(content, /__meteorRegisterTestFile\(/);
  assert.match(content, /\(\) => ctx\(file\)/);
  assert.match(content, /mode: 'sync'/);
});

test('ordinary Meteor eager entry does not register TestRunner source files', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-runtime-plain-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(projectRoot, { recursive: true });

  const generated = generateEagerTestFile({
    isAppTest: false,
    projectDir: projectRoot,
    buildContext: '_build',
  });
  execFileSync(process.execPath, ['--check', generated]);
  const content = fs.readFileSync(generated, 'utf8');

  assert.doesNotMatch(content, /__meteorRegisterTestFile/);
  assert.match(content, /\.map\(ctx\)/);
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

test('legacy file filters restrict compilation and preserve full-app file naming', t => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-test-filter-'));
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
  for (const isAppTest of [false, true]) {
    const generated = generateEagerTestFile({
      projectDir,
      isAppTest,
      buildContext: '_build',
      testFiles: ['tests/legacy/', 'selected'],
    });
    execFileSync(process.execPath, ['--check', generated]);
    const content = fs.readFileSync(generated, 'utf8');
    const match = content.match(/regExp: (\/.*\/),\n/);
    assert.ok(match);
    const selection = Function(`return ${match[1]}`)();
    const suffix = isAppTest ? '.app-test.js' : '.test.js';
    assert.equal(selection.test(`./tests/legacy/mocha${suffix}`), true);
    assert.equal(selection.test(`./imports/selected${suffix}`), true);
    assert.equal(selection.test(`./imports/unrelated${suffix}`), false);
    assert.equal(selection.test('./tests/legacy/helper.js'), false);
    if (isAppTest) assert.equal(selection.test('./imports/selected.test.js'), false);
  }
});
