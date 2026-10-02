const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const source = path.resolve(__dirname, '../../../packages/test-in-console/run.sh');
const helperSource = path.resolve(__dirname, '../../../tools/tool-testing/clients/puppeteer/ensure-browser.cjs');
const lockSource = path.resolve(__dirname, '../../../tools/tool-testing/clients/puppeteer/with-browser-lock.pl');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-in-console-lock-'));
  const packageDir = path.join(root, 'packages/test-in-console');
  const helperDir = path.join(root, 'tools/tool-testing/clients/puppeteer');
  const puppeteerDir = path.join(root, 'dev_bundle/lib/node_modules/puppeteer');
  const tmpDir = path.join(root, 'tmp');
  const chrome = path.join(root, 'fake-chrome');
  const installCount = path.join(root, 'install-count');
  const installStarted = path.join(root, 'install-started');
  const helperPid = path.join(root, 'helper-pid');
  for (const dir of [packageDir, helperDir, puppeteerDir, tmpDir, path.join(root, 'dev_bundle/bin')]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(source, path.join(packageDir, 'run.sh'));
  fs.copyFileSync(helperSource, path.join(helperDir, 'ensure-browser.cjs'));
  fs.copyFileSync(lockSource, path.join(helperDir, 'with-browser-lock.pl'));
  fs.symlinkSync(process.execPath, path.join(root, 'dev_bundle/bin/node'));
  fs.writeFileSync(path.join(puppeteerDir, 'package.json'), '{"version":"25.9.0"}');
  fs.writeFileSync(path.join(puppeteerDir, 'index.js'), `exports.executablePath = () => ${JSON.stringify(chrome)};\n`);
  fs.writeFileSync(path.join(puppeteerDir, 'install.mjs'), `
    import fs from 'node:fs';
    fs.appendFileSync(${JSON.stringify(installCount)}, '1');
    fs.writeFileSync(${JSON.stringify(installStarted)}, '');
    fs.writeFileSync(${JSON.stringify(helperPid)}, String(process.ppid));
    await new Promise(resolve => setTimeout(resolve, 1200));
    fs.writeFileSync(${JSON.stringify(chrome)}, '#!/bin/sh\\nexit 0\\n', { mode: 0o755 });
  `);
  fs.writeFileSync(path.join(packageDir, 'puppeteer_runner.js'), '');
  fs.writeFileSync(path.join(root, 'meteor'), '#!/bin/bash\nif [ "${1:-}" = "--version" ]; then exit 0; fi\nif [ "${1:-}" = "test-packages" ]; then echo "test-in-console listening"; sleep 2; exit 0; fi\nexit 1\n', { mode: 0o755 });
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(binDir, 'curl'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    flock: path.join(tmpDir, 'puppeteer-chrome-cache-25.9.0-v2.flock'),
    legacyLock: path.join(tmpDir, 'puppeteer-chrome-cache-25.9.0.lock'),
    legacyCache: path.join(tmpDir, 'puppeteer-chrome-cache-25.9.0'),
    installStarted,
    helperPid,
    installCount,
    script: path.join(packageDir, 'run.sh'),
    env: { ...process.env, TMPDIR: tmpDir, TEST_PORT: '43333', PATH: `${binDir}:${process.env.PATH}` },
  };
}

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for fixture state');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

function canAcquireLock(lock) {
  return spawnSync('perl', [
    '-MFcntl=:flock', '-e',
    'open my $f, ">>", $ARGV[0] or die $!; exit(flock($f, LOCK_EX | LOCK_NB) ? 0 : 1)',
    lock,
  ]).status === 0;
}

test('an old checkout cannot block or lose its cache to a new job', t => {
  const f = fixture(t);
  fs.mkdirSync(f.legacyLock);
  fs.writeFileSync(path.join(f.legacyLock, 'pid'), '999999999\n');
  fs.mkdirSync(f.legacyCache);
  fs.writeFileSync(path.join(f.legacyCache, 'sentinel'), 'old browser');
  const result = spawnSync('bash', [f.script, 'ddp-server'], {
    cwd: f.root, env: f.env, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(f.installCount, 'utf8'), '1');
  assert.equal(fs.readFileSync(path.join(f.legacyCache, 'sentinel'), 'utf8'), 'old browser');
});

test('two jobs install Chrome only once', async t => {
  const f = fixture(t);
  const first = spawn('bash', [f.script, 'ddp-server'], { cwd: f.root, env: f.env });
  const second = spawn('bash', [f.script, 'ddp-server'], { cwd: f.root, env: f.env });
  t.after(() => { first.kill('SIGKILL'); second.kill('SIGKILL'); });
  const results = await Promise.all([first, second].map(child => new Promise(resolve => child.on('exit', resolve))));
  assert.deepEqual(results, [0, 0]);
  assert.equal(fs.readFileSync(f.installCount, 'utf8'), '1');
});

test('an orphaned installer retains the lock after its parent is killed', async t => {
  const f = fixture(t);
  const owner = spawn('bash', [f.script, 'ddp-server'], { cwd: f.root, env: f.env });
  t.after(() => owner.kill('SIGKILL'));
  await waitFor(() => fs.existsSync(f.installStarted));
  process.kill(Number(fs.readFileSync(f.helperPid, 'utf8')), 'SIGKILL');
  assert.equal(canAcquireLock(f.flock), false, 'the installer must still hold the flock');
  await waitFor(() => canAcquireLock(f.flock));
  assert.equal(fs.readFileSync(f.installCount, 'utf8'), '1');
});
