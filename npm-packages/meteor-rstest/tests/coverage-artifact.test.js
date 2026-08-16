const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  MAX_COVERAGE_ARTIFACT_BYTES,
  readCoverageArtifact,
  writeCoverageArtifact,
} = require('../src/coverage/artifact.js');

function fileCoverage(filename) {
  return {
    path: filename,
    statementMap: {
      0: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 8 },
      },
    },
    fnMap: {},
    branchMap: {},
    s: { 0: 1 },
    f: {},
    b: {},
  };
}

function createRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-artifact-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('artifact writer creates one atomic private generation-bound file', t => {
  const root = createRoot(t);
  const outputPath = path.join(root, 'generation-1', 'native.json');
  const source = path.join(root, 'app.js');
  const artifact = {
    schemaVersion: 1,
    generation: 'generation-1',
    producer: 'native',
    coverage: { [source]: fileCoverage(source) },
  };

  writeCoverageArtifact({
    outputPath,
    expectedPath: outputPath,
    artifact,
  });

  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), artifact);
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(outputPath)).mode & 0o077, 0);
  assert.deepEqual(fs.readdirSync(path.dirname(outputPath)), ['native.json']);
  assert.throws(() => writeCoverageArtifact({
    outputPath,
    expectedPath: outputPath,
    artifact,
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPLAY');
    return true;
  });
});

test('artifact reader enforces the exact expected path and single consumption', t => {
  const root = createRoot(t);
  const outputPath = path.join(root, 'generation-2', 'server.json');
  const source = path.join(root, 'server.js');
  writeCoverageArtifact({
    outputPath,
    expectedPath: outputPath,
    artifact: {
      schemaVersion: 1,
      generation: 'generation-2',
      producer: 'server',
      coverage: { [source]: fileCoverage(source) },
    },
  });

  assert.throws(() => readCoverageArtifact({
    filePath: outputPath,
    expectedPath: path.join(root, 'other', 'server.json'),
    generation: 'generation-2',
    producer: 'server',
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_PATH_MISMATCH');
    return true;
  });

  const consumed = new Set();
  const artifact = readCoverageArtifact({
    filePath: outputPath,
    expectedPath: outputPath,
    generation: 'generation-2',
    producer: 'server',
    consumed,
  });
  assert.equal(artifact.coverage[source].s[0], 1);
  assert.throws(() => readCoverageArtifact({
    filePath: outputPath,
    expectedPath: outputPath,
    generation: 'generation-2',
    producer: 'server',
    consumed,
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPLAY');
    return true;
  });
});

test('artifact reader rejects stale schema, generation, producer, and invalid maps', t => {
  const root = createRoot(t);
  const outputPath = path.join(root, 'artifact.json');
  const source = path.join(root, 'source.js');
  const valid = {
    schemaVersion: 1,
    generation: 'current',
    producer: 'client',
    coverage: { [source]: fileCoverage(source) },
  };
  const cases = [
    [{ ...valid, schemaVersion: 2 }, 'METEOR_RSTEST_COVERAGE_SCHEMA'],
    [{ ...valid, generation: 'stale' }, 'METEOR_RSTEST_COVERAGE_STALE'],
    [{ ...valid, producer: 'server' }, 'METEOR_RSTEST_COVERAGE_PRODUCER'],
    [{ ...valid, coverage: { [source]: { ...fileCoverage(source), s: { 0: -1 } } } },
      'METEOR_RSTEST_COVERAGE_MAP_INVALID'],
  ];

  for (const [artifact, code] of cases) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact));
    assert.throws(() => readCoverageArtifact({
      filePath: outputPath,
      expectedPath: outputPath,
      generation: 'current',
      producer: 'client',
    }), error => {
      assert.equal(error.code, code);
      return true;
    });
  }
});

test('artifact IO rejects payloads above the 64 MiB serialized limit', t => {
  const root = createRoot(t);
  const outputPath = path.join(root, 'oversized.json');
  fs.writeFileSync(outputPath, '{}');
  fs.truncateSync(outputPath, MAX_COVERAGE_ARTIFACT_BYTES + 1);

  assert.throws(() => readCoverageArtifact({
    filePath: outputPath,
    expectedPath: outputPath,
    generation: 'current',
    producer: 'native',
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_OVERSIZED');
    return true;
  });
});

test('artifact reader rejects a symlink substituted at an expected path', t => {
  const root = createRoot(t);
  const source = path.join(root, 'source.js');
  const realArtifact = path.join(root, 'elsewhere.json');
  const expectedPath = path.join(root, 'generation', 'server.json');
  fs.mkdirSync(path.dirname(expectedPath), { recursive: true });
  fs.writeFileSync(realArtifact, JSON.stringify({
    schemaVersion: 1,
    generation: 'generation',
    producer: 'server',
    coverage: { [source]: fileCoverage(source) },
  }));
  fs.symlinkSync(realArtifact, expectedPath);

  assert.throws(() => readCoverageArtifact({
    filePath: expectedPath,
    expectedPath,
    generation: 'generation',
    producer: 'server',
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_PATH_MISMATCH');
    return true;
  });
});
