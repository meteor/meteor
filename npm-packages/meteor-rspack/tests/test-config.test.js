const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const test = require('node:test');

const { createTestRspackConfig } = require('../config.js');
const { generateEagerTestFile } = require('../lib/test.js');

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
