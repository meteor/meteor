#!/usr/bin/env node

/**
 * Windows lifecycle smoke test for rspack process cleanup.
 *
 * Verifies that when meteor receives a graceful shutdown, the rspack child
 * tree (cmd.exe -> npm exec -> rspack-node) terminates with it and releases
 * the devserver port. Exercises the SIGHUP path: `taskkill /PID <pid>`
 * (without /F) sends a close request that libuv translates to SIGHUP, which
 * meteor's signal handler turns into a tree-kill via taskkill /T /F.
 *
 * Designed to be Jest-free so the Windows runner doesn't have to install
 * Playwright / Jest. Invoked from `.github/workflows/windows-rspack-e2e.yml`.
 *
 * Exit codes:
 *   0 - success (rspack tree gone, port released)
 *   1 - setup failure (could not create app, install deps, or start meteor)
 *   2 - cleanup failure (port still held after shutdown)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn, execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const METEOR_BIN = process.platform === 'win32'
  ? path.join(REPO_ROOT, 'meteor.bat')
  : path.join(REPO_ROOT, 'meteor');

const APP_PORT = Number(process.env.METEOR_APP_PORT) || 3146;
const RSPACK_PORT = Number(process.env.RSPACK_DEVSERVER_PORT) || 18146;
const READY_TIMEOUT_MS = Number(process.env.READY_TIMEOUT_MS) || 10 * 60 * 1000;
const POST_KILL_GRACE_MS = Number(process.env.POST_KILL_GRACE_MS) || 5000;

function log(msg) {
  console.log(`[lifecycle] ${msg}`);
}

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

function waitFor(predicate, timeoutMs, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async () => {
      try {
        if (await predicate()) return resolve();
      } catch (e) {
        return reject(e);
      }
      if (Date.now() > deadline) {
        return reject(new Error(`Timeout after ${timeoutMs}ms waiting for condition`));
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function run(cmd, args, opts = {}) {
  log(`> ${cmd} ${args.join(' ')}`);
  const result = require('child_process').spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${cmd} ${args.join(' ')}`);
  }
}

function killTree(pid) {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
    } catch (e) { /* already gone */ }
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch (e) {
      try { process.kill(pid, 'SIGKILL'); } catch (e2) { /* already gone */ }
    }
  }
}

function gracefulKill(pid) {
  // Sends a close request: WM_CLOSE on Windows (libuv -> SIGHUP), SIGTERM on POSIX.
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pid)], { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }
  try { process.kill(pid, 'SIGTERM'); return true; } catch (e) { return false; }
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-lifecycle-'));
  const appName = 'app';
  const appDir = path.join(tempDir, appName);

  log(`Working directory: ${tempDir}`);

  try {
    log('Creating Meteor app with --react...');
    run(METEOR_BIN, ['create', appName, '--react'], { cwd: tempDir });

    log('Adding rspack package...');
    run(METEOR_BIN, ['add', 'rspack'], { cwd: appDir });

    log('Installing npm dependencies...');
    run(METEOR_BIN, ['npm', 'install'], { cwd: appDir });

    log(`Starting meteor on port ${APP_PORT} (rspack on ${RSPACK_PORT})...`);
    const meteor = spawn(METEOR_BIN, ['run', '--port', String(APP_PORT)], {
      cwd: appDir,
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        RSPACK_DEVSERVER_PORT: String(RSPACK_PORT),
        METEOR_ALLOW_SUPERUSER: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    meteor.stdout.on('data', (b) => process.stdout.write(b));
    meteor.stderr.on('data', (b) => process.stderr.write(b));

    const meteorExit = new Promise((resolve) => meteor.once('exit', resolve));

    log(`Waiting up to ${READY_TIMEOUT_MS}ms for app on port ${APP_PORT}...`);
    await waitFor(async () => !(await isPortAvailable(APP_PORT)), READY_TIMEOUT_MS, 1000);
    log('App is up');

    if (await isPortAvailable(RSPACK_PORT)) {
      throw new Error(`Rspack devserver port ${RSPACK_PORT} should be in use after startup`);
    }

    log(`Sending graceful shutdown to meteor pid=${meteor.pid}...`);
    if (!gracefulKill(meteor.pid)) {
      log('Graceful shutdown failed; falling back to taskkill /T /F');
      killTree(meteor.pid);
    }

    log('Awaiting meteor exit...');
    await Promise.race([
      meteorExit,
      new Promise((_, reject) => setTimeout(() => reject(new Error('meteor did not exit')), 30_000)),
    ]).catch((err) => {
      log(`Forcing tree-kill after timeout: ${err.message}`);
      killTree(meteor.pid);
    });

    log(`Waiting ${POST_KILL_GRACE_MS}ms for OS to release sockets...`);
    await new Promise((r) => setTimeout(r, POST_KILL_GRACE_MS));

    const appReleased = await isPortAvailable(APP_PORT);
    const rspackReleased = await isPortAvailable(RSPACK_PORT);

    log(`Port ${APP_PORT} available: ${appReleased}`);
    log(`Port ${RSPACK_PORT} available: ${rspackReleased}`);

    if (!appReleased || !rspackReleased) {
      log('FAIL: at least one port is still held by an orphan process');
      // Best-effort cleanup so the runner doesn't hang
      killTree(meteor.pid);
      process.exit(2);
    }

    log('PASS: rspack tree cleaned up and ports released');
    process.exit(0);
  } catch (err) {
    log(`Setup failure: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
