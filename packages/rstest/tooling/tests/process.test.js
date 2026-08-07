const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildRstestArgs,
  resolveRstestBin,
  startRstestProcess,
} = require('../provider/process.js');

function createApp() {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-process-'));
  fs.mkdirSync(path.join(appRoot, '.meteor'), { recursive: true });
  return appRoot;
}

test('Meteor-owned options map to wrapper CLI while Rstest arguments stay native', () => {
  assert.deepEqual(buildRstestArgs({
    appDir: '/app',
    localDir: '/harness/.meteor/local',
    once: true,
    fullApp: false,
    server: true,
    client: false,
    command: 'test',
    config: 'config/rstest.js',
    project: 'meteor-pure-server',
    testFile: ['tests/a.test.js', 'tests/b.test.js'],
    testNamePattern: '^works$',
    passthrough: ['--coverage', '--retry', 2],
  }), [
    '--cwd', '/app',
    '--local-dir', '/harness/.meteor/local',
    '--once',
    '--server-only',
    '--command', 'test',
    '--config', 'config/rstest.js',
    '--project', 'meteor-pure-server',
    '--test-file', 'tests/a.test.js',
    '--test-file', 'tests/b.test.js',
    '--test-name-pattern', '^works$',
    '--', '--coverage', '--retry', '2',
  ]);
});

test('architecture selection is forwarded to dynamic Rstest config context', () => {
  assert.deepEqual(buildRstestArgs({
    appDir: '/app',
    localDir: '/harness/.meteor/local',
    command: 'test',
    server: false,
    client: true,
  }), [
    '--cwd', '/app',
    '--local-dir', '/harness/.meteor/local',
    '--client-only',
    '--command', 'test',
  ]);
});

test('native passthrough cannot replace Meteor-owned config or project plan', () => {
  for (const argument of [
    '--config=other.js', '-c=other.js', '--root', '--project=other',
    '--passWithNoTests', '--passWithNoTests=true',
  ]) {
    assert.throws(() => buildRstestArgs({
      appDir: '/app',
      localDir: '/local',
      command: 'test',
      passthrough: [argument],
    }), /Meteor-owned/);
  }
});

test('stable Meteor Rstest flags map to native Rstest CLI options', () => {
  assert.deepEqual(buildRstestArgs({
    appDir: '/app',
    localDir: '/harness/.meteor/local',
    once: true,
    command: 'test',
    browser: 'firefox',
    coverage: true,
    updateSnapshots: true,
    shard: '2/4',
    changed: true,
    changedSince: 'main',
    passWithNoTests: true,
  }), [
    '--cwd', '/app',
    '--local-dir', '/harness/.meteor/local',
    '--once',
    '--command', 'test',
    '--browser.name', 'firefox',
    '--coverage',
    '--update',
    '--shard', '2/4',
    '--changed', 'main',
    '--passWithNoTests',
  ]);
});

test('supervised Rstest process resolves app-local binary and stops its group once', async t => {
  const appRoot = createApp();
  const packageRoot = path.join(appRoot, 'node_modules/@meteorjs/rstest');
  const marker = path.join(appRoot, 'lifecycle.log');
  fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@meteorjs/rstest',
    version: '0.0.0-test',
  }));
  fs.writeFileSync(path.join(packageRoot, 'bin/meteor-rstest.js'), `
    const fs = require('node:fs');
    fs.appendFileSync(${JSON.stringify(marker)}, 'started\\n');
    process.on('SIGTERM', () => {
      fs.appendFileSync(${JSON.stringify(marker)}, 'stopped\\n');
      process.exit(0);
    });
    setInterval(() => {}, 1000);
  `);
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  assert.equal(
    resolveRstestBin(appRoot),
    path.join(packageRoot, 'bin/meteor-rstest.js')
  );

  const processHandle = startRstestProcess({ appDir: appRoot, args: [], stdio: 'ignore' });
  for (let attempt = 0; attempt < 50 && !fs.existsSync(marker); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(fs.readFileSync(marker, 'utf8'), 'started\n');

  await processHandle.stop();
  assert.equal(await processHandle.completion, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'started\nstopped\n');
});
