const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function findExecutable(name) {
  if (name === 'node' && process.version && !process.versions?.bun) {
    return process.execPath;
  }
  if (name === 'bun' && process.versions?.bun) {
    return process.execPath;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, name);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
  }
  return null;
}

function createChildScript(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-ipc-fixture-'));
  const scriptPath = path.join(dir, 'child-worker.js');

  const content = `
let isCleanExit = false;

process.on('message', (msg) => {
  if (msg.topic === 'ping') {
    process.send({
      topic: 'pong',
      payload: {
        received: msg.payload,
        runtime: typeof Bun !== 'undefined' ? 'bun' : 'node',
      },
    });
  }
});

process.on('SIGTERM', () => {
  isCleanExit = true;
  process.exit(0);
});
`;

  fs.writeFileSync(scriptPath, content, 'utf8');

  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  return scriptPath;
}

function runIpcScenario(executable, scriptPath, isBun = false) {
  return new Promise((resolve, reject) => {
    const spawnOpts = {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    };
    if (isBun) {
      spawnOpts.serialization = 'json';
    }

    const child = spawn(executable, [scriptPath], spawnOpts);
    let receivedPong = null;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timed out waiting for IPC response from ${executable}`));
    }, 5000);

    child.on('message', (msg) => {
      if (msg.topic === 'pong') {
        receivedPong = msg.payload;
        // Verify graceful shutdown
        child.kill('SIGTERM');
      }
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ receivedPong, code, signal });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // Send test ping to child
    child.send({
      topic: 'ping',
      payload: { testId: 'core-ipc-42', value: 'hello-ipc' },
    });
  });
}

test('Parent to Node child IPC exchanges JSON messages and terminates cleanly', async (t) => {
  const nodePath = findExecutable('node');
  if (!nodePath) {
    t.skip('Node executable not found in PATH');
    return;
  }

  const scriptPath = createChildScript(t);
  const result = await runIpcScenario(nodePath, scriptPath, false);

  assert.ok(result.receivedPong, 'Pong payload must be received');
  assert.equal(result.receivedPong.runtime, 'node');
  assert.equal(result.receivedPong.received.testId, 'core-ipc-42');
  assert.equal(result.receivedPong.received.value, 'hello-ipc');
  assert.equal(result.code, 0, 'child must exit cleanly with code 0');
  assert.ok(!result.signal, 'child must not be terminated by a signal');
});

test('Parent to Bun child IPC exchanges JSON messages via serialization:json and terminates cleanly', async (t) => {
  const bunPath = findExecutable('bun');
  if (!bunPath) {
    t.skip('Bun executable not found in PATH');
    return;
  }

  const scriptPath = createChildScript(t);
  const result = await runIpcScenario(bunPath, scriptPath, true);

  assert.ok(result.receivedPong, 'Pong payload must be received from Bun');
  assert.equal(result.receivedPong.runtime, 'bun');
  assert.equal(result.receivedPong.received.testId, 'core-ipc-42');
  assert.equal(result.receivedPong.received.value, 'hello-ipc');
  assert.equal(result.code, 0, 'child must exit cleanly with code 0');
  assert.ok(!result.signal, 'child must not be terminated by a signal');
});
