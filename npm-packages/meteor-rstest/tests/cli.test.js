const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const packageRoot = path.resolve(__dirname, '..');
const bin = path.join(packageRoot, 'bin/meteor-rstest.js');

function createApp({ source, configSource = 'module.exports = { globals: true };' }) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-cli-'));
  const testsRoot = path.join(appRoot, 'tests/rstest/pure/server');
  fs.mkdirSync(testsRoot, { recursive: true });
  fs.writeFileSync(path.join(testsRoot, 'cli.test.js'), source);
  fs.writeFileSync(path.join(appRoot, 'rstest.config.js'), configSource);
  return appRoot;
}

function run(appRoot, args = []) {
  return spawnSync(process.execPath, [bin, '--cwd', appRoot, '--once', ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

test('Meteor Rstest CLI returns zero after native Rstest run', t => {
  const appRoot = createApp({
    source: "test('CLI pass', () => expect(6 * 7).toBe(42));",
  });
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  const result = run(appRoot);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /CLI pass/);
  assert.match(result.stdout, /"passedTests": 1/);
});

test('Meteor Rstest CLI preserves failing exit status and name filter', t => {
  const appRoot = createApp({
    source: `
      test('selected failure', () => expect('meteor').toBe('rstest'));
      test('unselected pass', () => expect(true).toBe(true));
    `,
  });
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  const result = run(appRoot, ['--test-name-pattern', '^selected failure$']);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout + result.stderr, /selected failure/);
  assert.match(result.stdout + result.stderr, /"skippedTests": 1/);
});

test('dynamic Meteor config receives context once through native Rstest CLI', t => {
  const marker = path.join(os.tmpdir(), `meteor-rstest-config-${process.pid}-${Date.now()}.txt`);
  const appRoot = createApp({
    source: "test('context config', () => expect(true).toBe(true));",
    configSource: `
      const fs = require('node:fs');
      const { defineConfig } = require(${JSON.stringify(packageRoot)});
      module.exports = defineConfig(context => {
        fs.appendFileSync(
          ${JSON.stringify(marker)},
          [context.command, context.server, context.client, context.verbose, context.architectures.join(',')].join('|') + '\\n'
        );
        return { globals: true };
      });
    `,
  });
  t.after(() => {
    fs.rmSync(appRoot, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  });

  const result = run(appRoot, [
    '--verbose',
    '--server-only',
    '--architecture', 'os.test.x86_64',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'test|true|false|true|os.test.x86_64\n');
});

test('package runtime plan evaluates dynamic config once with distinct harness root', t => {
  const marker = path.join(os.tmpdir(), `meteor-rstest-package-config-${process.pid}-${Date.now()}.txt`);
  const output = path.join(os.tmpdir(), `meteor-rstest-package-plan-${process.pid}-${Date.now()}.json`);
  const harnessRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-harness-'));
  const appRoot = createApp({
    source: "test('must not run in package plan', () => expect(false).toBe(true));",
    configSource: `
      const fs = require('node:fs');
      const { defineConfig } = require(${JSON.stringify(packageRoot)});
      module.exports = defineConfig(context => {
        fs.appendFileSync(
          ${JSON.stringify(marker)},
          [context.command, context.packageTests, context.harnessRoot].join('|') + '\\n'
        );
        return { testTimeout: 4321, hookTimeout: 1234, maxConcurrency: 3 };
      });
    `,
  });
  t.after(() => {
    fs.rmSync(appRoot, { recursive: true, force: true });
    fs.rmSync(harnessRoot, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
    fs.rmSync(output, { force: true });
  });

  const result = run(appRoot, [
    '--package-tests',
    '--harness-root', harnessRoot,
    '--runtime-plan-output', output,
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    fs.readFileSync(marker, 'utf8'),
    `test-packages|true|${harnessRoot}\n`,
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), {
    schemaVersion: 1,
    generation: null,
    testTimeout: 4321,
    hookTimeout: 1234,
    maxConcurrency: 3,
    retry: 0,
    globals: false,
    clearMocks: false,
    resetMocks: false,
    restoreMocks: false,
    unstubEnvs: false,
    unstubGlobals: false,
    expect: {},
    snapshotFormat: {},
    env: {},
    silent: false,
    disableConsoleIntercept: true,
    printConsoleTrace: false,
    includeTaskLocation: false,
    setupFiles: [],
  });
});

test('native run writes generation-bound runtime settings atomically', t => {
  const output = path.join(os.tmpdir(), `meteor-rstest-settings-${process.pid}-${Date.now()}.json`);
  const appRoot = createApp({
    source: "test('settings run', () => expect(true).toBe(true));",
    configSource: 'module.exports = { globals: true, testTimeout: 9876, hookTimeout: 2345, maxConcurrency: 7 };',
  });
  t.after(() => {
    fs.rmSync(appRoot, { recursive: true, force: true });
    fs.rmSync(output, { force: true });
  });

  const result = run(appRoot, [
    '--runtime-settings-output', output,
    '--runtime-settings-generation', 'generation-7',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), {
    schemaVersion: 1,
    generation: 'generation-7',
    testTimeout: 9876,
    hookTimeout: 2345,
    maxConcurrency: 7,
    retry: 0,
    globals: true,
    clearMocks: false,
    resetMocks: false,
    restoreMocks: false,
    unstubEnvs: false,
    unstubGlobals: false,
    expect: {},
    snapshotFormat: {},
    env: {},
    silent: false,
    disableConsoleIntercept: true,
    printConsoleTrace: false,
    includeTaskLocation: false,
    setupFiles: [],
  });
});

test('native run writes its generation-bound coverage plan before Meteor compilation', t => {
  const planOutput = path.join(os.tmpdir(), `meteor-rstest-coverage-plan-${process.pid}-${Date.now()}.json`);
  const settingsOutput = path.join(os.tmpdir(), `meteor-rstest-coverage-settings-${process.pid}-${Date.now()}.json`);
  const artifact = path.join(os.tmpdir(), `meteor-rstest-coverage-artifact-${process.pid}-${Date.now()}.json`);
  const appRoot = createApp({
    source: "test('coverage plan', () => expect(true).toBe(true));",
    configSource: "module.exports = { coverage: { enabled: true, provider: 'istanbul', exclude: ['**/*.test.js'] } };",
  });
  t.after(() => {
    fs.rmSync(appRoot, { recursive: true, force: true });
    fs.rmSync(planOutput, { force: true });
    fs.rmSync(settingsOutput, { force: true });
  });

  const result = run(appRoot, [
    '--runtime-plan-output', settingsOutput,
    '--coverage',
    '--coverage-plan-output', planOutput,
    '--coverage-generation', 'generation-8',
    '--coverage-artifact', artifact,
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(planOutput, 'utf8')), {
    schemaVersion: 1,
    generation: 'generation-8',
    enabled: true,
    provider: 'istanbul',
    root: appRoot,
    include: [],
    exclude: ['**/*.test.js'],
    allowExternal: false,
    artifactRoot: path.dirname(artifact),
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsOutput, 'utf8')).coverage, {
    schemaVersion: 1,
    generation: 'generation-8',
    enabled: true,
    provider: 'istanbul',
    root: appRoot,
    include: [],
    exclude: ['**/*.test.js'],
    allowExternal: false,
    artifactRoot: path.dirname(artifact),
  });
});

test('mixed native run persists imported source coverage before Meteor host start', t => {
  const settingsOutput = path.join(
    os.tmpdir(),
    `meteor-rstest-native-settings-${process.pid}-${Date.now()}.json`,
  );
  const artifact = path.join(
    os.tmpdir(),
    `meteor-rstest-native-artifact-${process.pid}-${Date.now()}.json`,
  );
  const appRoot = createApp({
    source: "import { answer } from '../../../../imports/answer.js'; test('native capture', () => expect(answer()).toBe(42));",
    configSource: "module.exports = { globals: true, coverage: { enabled: true, provider: 'istanbul', include: ['imports/**/*.js'], exclude: ['**/*.test.js'] } };",
  });
  fs.mkdirSync(path.join(appRoot, 'imports'), { recursive: true });
  fs.writeFileSync(
    path.join(appRoot, 'imports/answer.js'),
    'export function answer() { return 42; }\n',
  );
  fs.symlinkSync(
    path.join(packageRoot, 'node_modules'),
    path.join(appRoot, 'node_modules'),
    'junction',
  );
  t.after(() => {
    fs.rmSync(appRoot, { recursive: true, force: true });
    fs.rmSync(settingsOutput, { force: true });
    fs.rmSync(artifact, { force: true });
  });

  const result = run(appRoot, [
    '--runtime-settings-output', settingsOutput,
    '--runtime-settings-generation', 'generation-native-capture',
    '--coverage',
    '--coverage-generation', 'generation-native-capture',
    '--coverage-artifact', artifact,
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const nativeArtifact = JSON.parse(fs.readFileSync(artifact, 'utf8'));
  const answerCoverage = Object.entries(nativeArtifact.coverage).find(([file]) =>
    file.replaceAll('\\', '/').endsWith('/imports/answer.js')
  );
  assert.ok(answerCoverage);
  assert.ok(Object.values(answerCoverage[1].s).some(count => count > 0));
});

test('disabled coverage ignores wrapper plan and artifact options', t => {
  const planOutput = path.join(os.tmpdir(), `meteor-rstest-disabled-plan-${process.pid}-${Date.now()}.json`);
  const settingsOutput = path.join(os.tmpdir(), `meteor-rstest-disabled-settings-${process.pid}-${Date.now()}.json`);
  const artifact = path.join(os.tmpdir(), `meteor-rstest-disabled-artifact-${process.pid}-${Date.now()}.json`);
  const appRoot = createApp({
    source: "test('disabled coverage plan', () => expect(true).toBe(true));",
    configSource: "module.exports = { coverage: { enabled: false, provider: 'istanbul' } };",
  });
  t.after(() => {
    fs.rmSync(appRoot, { recursive: true, force: true });
    fs.rmSync(planOutput, { force: true });
    fs.rmSync(settingsOutput, { force: true });
    fs.rmSync(artifact, { force: true });
  });

  const result = run(appRoot, [
    '--runtime-plan-output', settingsOutput,
    '--coverage-plan-output', planOutput,
    '--coverage-generation', 'generation-disabled',
    '--coverage-artifact', artifact,
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(planOutput), false);
  assert.equal(fs.existsSync(artifact), false);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(settingsOutput, 'utf8')), 'coverage'), false);
});

test('classification CLI writes routing manifest without evaluating user config', t => {
  const marker = path.join(os.tmpdir(), `meteor-rstest-classify-config-${process.pid}-${Date.now()}.txt`);
  const candidates = path.join(os.tmpdir(), `meteor-rstest-candidates-${process.pid}-${Date.now()}.json`);
  const output = path.join(os.tmpdir(), `meteor-rstest-classification-${process.pid}-${Date.now()}.json`);
  const appRoot = createApp({
    source: "test('classification only', () => expect(true).toBe(true));",
    configSource: `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'evaluated'); module.exports = { globals: true };`,
  });
  const testFile = path.join(appRoot, 'tests/rstest/pure/server/cli.test.js');
  fs.writeFileSync(candidates, JSON.stringify([testFile]));
  t.after(() => {
    fs.rmSync(appRoot, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
    fs.rmSync(candidates, { force: true });
    fs.rmSync(output, { force: true });
  });

  const result = run(appRoot, [
    '--classify-candidates', candidates,
    '--classification-output', output,
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(marker), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')).nativeNodeFiles, [testFile]);
});
