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

function coverageMap(filename = '/app/imports/worker.js') {
  return {
    [filename]: {
      path: filename,
      statementMap: {
        0: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 10 },
        },
      },
      fnMap: {},
      branchMap: {},
      s: { 0: 1 },
      f: {},
      b: {},
    },
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

test('coverage-enabled worker writes its explicit generation-bound artifact', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-result-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coverageGeneration = 'abcdef1234567890abcdef1234567890';
  const coverageRoot = path.join(root, coverageGeneration);
  const worker = {
    id: 'server-1',
    index: 0,
    total: 1,
    generation: '1234567890abcdef1234567890abcdef',
    resultPath: path.join(root, 'workers', 'server-1-result.json'),
    coveragePath: path.join(coverageRoot, 'worker-server-1.json'),
    coverageGeneration,
  };

  writeWorkerResult({ worker, result: passingResult(), coverage: coverageMap() });

  assert.deepEqual(JSON.parse(fs.readFileSync(worker.coveragePath, 'utf8')), {
    schemaVersion: 1,
    generation: coverageGeneration,
    producer: 'worker-server-1',
    coverage: coverageMap(),
  });
  assert.throws(
    () => writeWorkerResult({
      worker: { ...worker, resultPath: path.join(root, 'other', 'server-1-result.json') },
      result: passingResult(),
    }),
    /coverage map/,
  );
});

test('coverage-disabled worker neither requires nor accepts a coverage artifact', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-result-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const worker = {
    id: 'server-1',
    index: 0,
    total: 1,
    generation: '1234567890abcdef1234567890abcdef',
    resultPath: path.join(root, 'server-1-result.json'),
  };

  writeWorkerResult({ worker, result: passingResult() });
  assert.throws(
    () => writeWorkerResult({
      worker: { ...worker, resultPath: path.join(root, 'again', 'server-1-result.json') },
      result: passingResult(),
      coverage: coverageMap(),
    }),
    /not expect coverage/,
  );
});
