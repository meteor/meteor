const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { writeWorkerResult } = require('../server/worker-result.js');

function passingResult(name = 'worker case') {
  return {
    ok: true,
    stats: { total: 1, passed: 1, failed: 0, skipped: 0, todo: 0 },
    cases: [{ name, fullName: name, status: 'pass', duration: 1 }],
  };
}

test('worker result writes atomic private generation-bound payload once', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-result-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const resultPath = path.join(root, 'server-1-result.json');
  const worker = {
    id: 'server-1',
    index: 0,
    total: 2,
    generation: '1234567890abcdef1234567890abcdef',
    resultPath,
  };

  writeWorkerResult({ worker, result: passingResult() });
  assert.deepEqual(JSON.parse(fs.readFileSync(resultPath, 'utf8')), {
    protocolVersion: 1,
    generation: worker.generation,
    worker: { id: 'server-1', index: 0, total: 2 },
    result: passingResult(),
  });
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(resultPath).mode & 0o777, 0o600);
  }
  assert.equal(
    fs.readdirSync(root).some(name => name.endsWith('.tmp')),
    false
  );
  assert.throws(
    () => writeWorkerResult({ worker, result: passingResult() }),
    /already exists/
  );
});

test('worker result rejects unsafe identity, path, generation, and result', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-result-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const base = {
    id: 'server-1',
    index: 0,
    total: 1,
    generation: '1234567890abcdef1234567890abcdef',
    resultPath: path.join(root, 'server-1-result.json'),
  };

  assert.throws(() => writeWorkerResult({
    worker: { ...base, generation: '../bad' },
    result: passingResult(),
  }), /generation/);
  assert.throws(() => writeWorkerResult({
    worker: { ...base, resultPath: 'relative.json' },
    result: passingResult(),
  }), /absolute/);
  assert.throws(() => writeWorkerResult({
    worker: { ...base, resultPath: path.join(root, 'other.json') },
    result: passingResult(),
  }), /identity/);
  assert.throws(() => writeWorkerResult({
    worker: base,
    result: { ...passingResult(), ok: false },
  }), /result payload/);
});
