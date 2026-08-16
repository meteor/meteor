const assert = require('node:assert/strict');
const test = require('node:test');

const {
  COVERAGE_CHUNK_BYTES,
  MAX_COVERAGE_BYTES,
  createCoverageFrameGate,
  serializeCoverageFrames,
} = require('../runtime/coverage-protocol.js');

const generation = '1234567890abcdef1234567890abcdef';
const token = 'client-capability-token';

function fileCoverage(file = '/app/imports/example.js', hits = 1) {
  const location = {
    start: { line: 1, column: 0 },
    end: { line: 1, column: 10 },
  };
  return {
    path: file,
    statementMap: { 0: location },
    fnMap: {},
    branchMap: {},
    s: { 0: hits },
    f: {},
    b: {},
  };
}

function coverage(overrides = {}) {
  const filename = '/app/imports/example.js';
  return { [filename]: { ...fileCoverage(filename), ...overrides } };
}

function frames(overrides = {}) {
  return serializeCoverageFrames({
    generation,
    token,
    producer: 'client',
    coverage: coverage(),
    ...overrides,
  });
}

function gate(overrides = {}) {
  return createCoverageFrameGate({
    generation,
    token,
    producer: 'client',
    ...overrides,
  });
}

function submitAll(receiver, values) {
  values.forEach(frame => receiver.submit(frame));
  return receiver.commit();
}

test('authenticated begin/chunk/commit reconstructs one coverage artifact', () => {
  const artifact = submitAll(gate(), frames());

  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.generation, generation);
  assert.equal(artifact.producer, 'client');
  assert.equal(artifact.coverage['/app/imports/example.js'].s[0], 1);
});

test('serializer bounds decoded chunks to 128 KiB without corrupting UTF-8', () => {
  const filename = `/app/imports/${'é'.repeat(COVERAGE_CHUNK_BYTES)}.js`;
  const serialized = frames({
    coverage: { [filename]: fileCoverage(filename) },
  });
  const chunks = serialized.filter(frame => frame.type === 'chunk');

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(Buffer.from(chunk.data, 'base64').byteLength <= COVERAGE_CHUNK_BYTES);
  }
  assert.ok(submitAll(gate(), serialized).coverage[filename]);
});

test('gate rejects out-of-order sequences and replay after commit', () => {
  const serialized = frames();
  const receiver = gate();
  receiver.submit(serialized[0]);
  assert.throws(
    () => receiver.submit({ ...serialized[1], sequence: 1 }),
    error => error.code === 'METEOR_RSTEST_COVERAGE_SEQUENCE',
  );

  const committed = gate();
  submitAll(committed, serialized);
  assert.throws(
    () => committed.submit(serialized.at(-1)),
    error => error.code === 'METEOR_RSTEST_COVERAGE_REPLAY',
  );
});

test('gate authenticates generation, token, and producer on every frame', () => {
  const serialized = frames();
  for (const [field, value] of [
    ['generation', 'abcdef1234567890abcdef1234567890'],
    ['token', 'wrong-token'],
    ['producer', 'server'],
  ]) {
    assert.throws(
      () => gate().submit({ ...serialized[0], [field]: value }),
      error => error.code === 'METEOR_RSTEST_COVERAGE_AUTH',
    );
  }
});

test('gate rejects declared and actual byte-size disagreement', () => {
  const serialized = frames();
  const wrongDeclaration = serialized.map((frame, index) => index === 0
    ? { ...frame, size: frame.size + 1 }
    : frame.type === 'commit'
      ? { ...frame, size: frame.size + 1 }
      : frame);

  assert.throws(
    () => submitAll(gate(), wrongDeclaration),
    error => error.code === 'METEOR_RSTEST_COVERAGE_SIZE',
  );
});

test('gate rejects declarations above the 64 MiB aggregate cap', () => {
  const begin = frames()[0];
  assert.throws(
    () => gate().submit({ ...begin, size: MAX_COVERAGE_BYTES + 1 }),
    error => error.code === 'METEOR_RSTEST_COVERAGE_OVERSIZED',
  );
});

test('gate rejects invalid JSON at commit', () => {
  const common = { protocolVersion: 1, generation, token, producer: 'client' };
  const receiver = gate();
  receiver.submit({ ...common, type: 'begin', size: 1, chunks: 1 });
  receiver.submit({
    ...common,
    type: 'chunk',
    sequence: 0,
    data: Buffer.from('{').toString('base64'),
  });
  receiver.submit({ ...common, type: 'commit', size: 1, chunks: 1 });

  assert.throws(
    () => receiver.commit(),
    error => error.code === 'METEOR_RSTEST_COVERAGE_JSON',
  );
});

test('gate rejects malformed Istanbul file coverage', () => {
  const serialized = frames({ coverage: {
    '/app/imports/bad.js': {
      ...fileCoverage('/app/imports/bad.js'),
      statementMap: {},
    },
  } });

  assert.throws(
    () => submitAll(gate(), serialized),
    error => error.code === 'METEOR_RSTEST_COVERAGE_MAP_INVALID',
  );
});

test('gate accepts SWC anonymous-function declaration sentinels', () => {
  const filename = '/app/imports/methods.ts';
  const artifact = submitAll(gate(), frames({ coverage: {
    [filename]: {
      ...fileCoverage(filename),
      fnMap: {
        0: {
          name: 'anonymous',
          decl: {
            start: { line: 0, column: 0 },
            end: { line: 0, column: 0 },
          },
          loc: {
            start: { line: 10, column: 2 },
            end: { line: 12, column: 3 },
          },
        },
      },
      f: { 0: 1 },
    },
  } }));

  assert.equal(artifact.coverage[filename].f[0], 1);
});
