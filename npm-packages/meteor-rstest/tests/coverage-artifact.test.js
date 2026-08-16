const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  MAX_COVERAGE_ARTIFACT_BYTES,
  readCoverageArtifact,
  readCoverageManifest,
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

test('artifact reader keeps reading the opened descriptor after path substitution', t => {
  const root = createRoot(t);
  const source = path.join(root, 'source.js');
  const expectedPath = path.join(root, 'generation', 'server.json');
  const movedPath = path.join(root, 'generation', 'server-original.json');
  const replacementPath = path.join(root, 'replacement.json');
  fs.mkdirSync(path.dirname(expectedPath), { recursive: true });
  fs.writeFileSync(expectedPath, JSON.stringify({
    schemaVersion: 1,
    generation: 'generation',
    producer: 'server',
    coverage: { [source]: fileCoverage(source) },
  }));
  fs.writeFileSync(replacementPath, JSON.stringify({
    schemaVersion: 1,
    generation: 'stale',
    producer: 'server',
    coverage: { [source]: fileCoverage(source) },
  }));
  const originalOpen = fs.openSync;
  const originalReadFile = fs.readFileSync;
  let substituted = false;
  const substitute = () => {
    if (substituted) return;
    substituted = true;
    fs.renameSync(expectedPath, movedPath);
    fs.symlinkSync(replacementPath, expectedPath);
  };
  fs.openSync = function patchedOpen(filename, ...args) {
    const descriptor = originalOpen.call(this, filename, ...args);
    if (path.resolve(String(filename)) === path.resolve(expectedPath)) substitute();
    return descriptor;
  };
  fs.readFileSync = function patchedRead(filename, ...args) {
    if (typeof filename === 'string' &&
        path.resolve(filename) === path.resolve(expectedPath)) substitute();
    return originalReadFile.call(this, filename, ...args);
  };
  t.after(() => {
    fs.openSync = originalOpen;
    fs.readFileSync = originalReadFile;
  });

  const artifact = readCoverageArtifact({
    filePath: expectedPath,
    expectedPath,
    generation: 'generation',
    producer: 'server',
  });
  assert.equal(substituted, true);
  assert.equal(artifact.generation, 'generation');
});

test('artifact writer atomically refuses a destination created at publication', t => {
  const root = createRoot(t);
  const outputPath = path.join(root, 'generation', 'server.json');
  const source = path.join(root, 'source.js');
  const originalRename = fs.renameSync;
  const originalLink = fs.linkSync;
  const sentinel = '{"sentinel":true}';
  const raceDestination = (oldPath, newPath, operation) => {
    if (path.resolve(newPath) === path.resolve(outputPath) &&
        !fs.existsSync(outputPath)) {
      fs.writeFileSync(outputPath, sentinel);
    }
    return operation(oldPath, newPath);
  };
  fs.renameSync = (oldPath, newPath) => raceDestination(
    oldPath,
    newPath,
    originalRename,
  );
  fs.linkSync = (oldPath, newPath) => raceDestination(
    oldPath,
    newPath,
    originalLink,
  );
  t.after(() => {
    fs.renameSync = originalRename;
    fs.linkSync = originalLink;
  });

  assert.throws(() => writeCoverageArtifact({
    outputPath,
    expectedPath: outputPath,
    artifact: {
      schemaVersion: 1,
      generation: 'generation',
      producer: 'server',
      coverage: { [source]: fileCoverage(source) },
    },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_REPLAY');
    return true;
  });
  assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);
});

test('artifact IO rejects symlinked parent components', t => {
  const root = createRoot(t);
  const outside = path.join(root, 'outside');
  const linked = path.join(root, 'linked');
  const outputPath = path.join(linked, 'generation', 'server.json');
  const source = path.join(root, 'source.js');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, linked);

  assert.throws(() => writeCoverageArtifact({
    outputPath,
    expectedPath: outputPath,
    artifact: {
      schemaVersion: 1,
      generation: 'generation',
      producer: 'server',
      coverage: { [source]: fileCoverage(source) },
    },
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_PATH_MISMATCH');
    return true;
  });
  assert.equal(fs.existsSync(path.join(outside, 'generation', 'server.json')), false);
});

test('manifest reader uses no-follow bounded descriptor IO', t => {
  const root = createRoot(t);
  const manifestPath = path.join(root, 'manifest.json');
  const replacement = path.join(root, 'replacement.json');
  fs.writeFileSync(replacement, '{}');
  fs.symlinkSync(replacement, manifestPath);

  assert.throws(() => readCoverageManifest({
    filePath: manifestPath,
    expectedPath: manifestPath,
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_PATH_MISMATCH');
    return true;
  });

  fs.unlinkSync(manifestPath);
  fs.writeFileSync(manifestPath, '{}');
  fs.truncateSync(manifestPath, MAX_COVERAGE_ARTIFACT_BYTES + 1);
  assert.throws(() => readCoverageManifest({
    filePath: manifestPath,
    expectedPath: manifestPath,
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_OVERSIZED');
    return true;
  });
});

test('manifest reader keeps reading the opened descriptor after path substitution', t => {
  const root = createRoot(t);
  const manifestPath = path.join(root, 'manifest.json');
  const movedPath = path.join(root, 'manifest-original.json');
  const replacementPath = path.join(root, 'replacement.json');
  fs.writeFileSync(manifestPath, '{"generation":"current"}');
  fs.writeFileSync(replacementPath, '{"generation":"stale"}');
  const originalOpen = fs.openSync;
  const originalReadFile = fs.readFileSync;
  let substituted = false;
  const substitute = () => {
    if (substituted) return;
    substituted = true;
    fs.renameSync(manifestPath, movedPath);
    fs.symlinkSync(replacementPath, manifestPath);
  };
  fs.openSync = function patchedOpen(filename, ...args) {
    const descriptor = originalOpen.call(this, filename, ...args);
    if (path.resolve(String(filename)) === path.resolve(manifestPath)) substitute();
    return descriptor;
  };
  fs.readFileSync = function patchedRead(filename, ...args) {
    if (typeof filename === 'string' &&
        path.resolve(filename) === path.resolve(manifestPath)) substitute();
    return originalReadFile.call(this, filename, ...args);
  };
  t.after(() => {
    fs.openSync = originalOpen;
    fs.readFileSync = originalReadFile;
  });

  assert.deepEqual(readCoverageManifest({
    filePath: manifestPath,
    expectedPath: manifestPath,
  }), { generation: 'current' });
  assert.equal(substituted, true);
});

test('descriptor reader reports a missing expected artifact deterministically', t => {
  const root = createRoot(t);
  const outputPath = path.join(root, 'generation', 'missing.json');

  assert.throws(() => readCoverageArtifact({
    filePath: outputPath,
    expectedPath: outputPath,
    generation: 'generation',
    producer: 'server',
  }), error => {
    assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_MISSING');
    return true;
  });
});

test('artifact validation rejects malformed locations and counter-map misalignment', t => {
  const root = createRoot(t);
  const outputPath = path.join(root, 'artifact.json');
  const source = path.join(root, 'source.js');
  const complete = {
    ...fileCoverage(source),
    fnMap: {
      0: {
        name: 'covered',
        decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 7 } },
        loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 8 } },
      },
    },
    branchMap: {
      0: {
        type: 'if',
        loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 8 } },
        locations: [
          { start: { line: 1, column: 0 }, end: { line: 1, column: 4 } },
          { start: { line: 1, column: 5 }, end: { line: 1, column: 8 } },
        ],
      },
    },
    f: { 0: 1 },
    b: { 0: [1, 0] },
  };
  const cases = [
    { ...complete, statementMap: {
      0: { start: { line: 0, column: 0 }, end: { line: 1, column: 8 } },
    } },
    { ...complete, s: {} },
    { ...complete, f: {} },
    { ...complete, b: { 0: [1] } },
    { ...complete, branchMap: { 0: { type: 'if', locations: [] } } },
    {
      ...complete,
      statementMap: { arbitrary: complete.statementMap[0] },
      s: { arbitrary: 1 },
    },
  ];

  for (const fileMap of cases) {
    fs.writeFileSync(outputPath, JSON.stringify({
      schemaVersion: 1,
      generation: 'generation',
      producer: 'server',
      coverage: { [source]: fileMap },
    }));
    assert.throws(() => readCoverageArtifact({
      filePath: outputPath,
      expectedPath: outputPath,
      generation: 'generation',
      producer: 'server',
    }), error => {
      assert.equal(error.code, 'METEOR_RSTEST_COVERAGE_MAP_INVALID');
      return true;
    });
  }
});
