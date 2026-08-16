const COVERAGE_PROTOCOL_VERSION = 1;
const COVERAGE_CHUNK_BYTES = 128 * 1024;
const MAX_COVERAGE_BYTES = 64 * 1024 * 1024;
const GENERATION_PATTERN = /^[a-f0-9]{32,128}$/i;
const PRODUCER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function coverageError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function utf8String(value) {
  return new TextDecoder('utf-8', { fatal: true }).decode(value);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32 * 1024) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32 * 1024));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_CHUNK',
      'Coverage chunk is not canonical base64.',
    );
  }
  let binary;
  try {
    binary = atob(value);
  } catch {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_CHUNK',
      'Coverage chunk is not valid base64.',
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizedJsonValue(value, seen) {
  if (value && typeof value.toJSON === 'function') {
    return normalizedJsonValue(value.toJSON(), seen);
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) throw new TypeError('Coverage map must be JSON-safe.');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(item => {
        const normalized = normalizedJsonValue(item, seen);
        return normalized === undefined ? null : normalized;
      });
    }
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const normalized = normalizedJsonValue(value[key], seen);
      if (normalized !== undefined && typeof normalized !== 'function' &&
          typeof normalized !== 'symbol') {
        output[key] = normalized;
      }
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

function deterministicStringify(value) {
  return JSON.stringify(normalizedJsonValue(value, new Set()));
}

function isCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertCounterRecord(value, field, filename, arrays = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} must be an object.`,
    );
  }
  for (const counter of Object.values(value)) {
    const valid = arrays
      ? Array.isArray(counter) && counter.every(isCounter)
      : isCounter(counter);
    if (!valid) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_MAP_INVALID',
        `Coverage ${field} for ${filename} contains an invalid counter.`,
      );
    }
  }
}

function assertPosition(value, field, filename) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Number.isSafeInteger(value.line) || value.line < 1 ||
      !Number.isSafeInteger(value.column) || value.column < 0) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} contains an invalid position.`,
    );
  }
}

function assertLocation(value, field, filename) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} contains an invalid location.`,
    );
  }
  assertPosition(value.start, field, filename);
  assertPosition(value.end, field, filename);
  if (value.end.line < value.start.line ||
      value.end.line === value.start.line && value.end.column < value.start.column) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} contains a reversed location.`,
    );
  }
}

function assertAlignedKeys(map, counters, field, filename) {
  const mapKeys = Object.keys(map).sort();
  const counterKeys = Object.keys(counters).sort();
  if (mapKeys.some(key => !/^(?:0|[1-9]\d*)$/.test(key) ||
      !Number.isSafeInteger(Number(key))) ||
      mapKeys.length !== counterKeys.length ||
      mapKeys.some((key, index) => key !== counterKeys[index])) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} does not align with its counters.`,
    );
  }
}

function assertFileCoverageStructure(fileCoverage, filename) {
  assertAlignedKeys(fileCoverage.statementMap, fileCoverage.s, 'statements', filename);
  assertAlignedKeys(fileCoverage.fnMap, fileCoverage.f, 'functions', filename);
  assertAlignedKeys(fileCoverage.branchMap, fileCoverage.b, 'branches', filename);
  for (const [id, location] of Object.entries(fileCoverage.statementMap)) {
    assertLocation(location, `statement ${id}`, filename);
  }
  for (const [id, entry] of Object.entries(fileCoverage.fnMap)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        typeof entry.name !== 'string') {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_MAP_INVALID',
        `Coverage function ${id} for ${filename} is invalid.`,
      );
    }
    assertLocation(entry.decl, `function ${id} declaration`, filename);
    assertLocation(entry.loc, `function ${id}`, filename);
  }
  for (const [id, entry] of Object.entries(fileCoverage.branchMap)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        typeof entry.type !== 'string' || !entry.type ||
        !Array.isArray(entry.locations) || entry.locations.length === 0) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_MAP_INVALID',
        `Coverage branch ${id} for ${filename} is invalid.`,
      );
    }
    if (entry.loc !== undefined) assertLocation(entry.loc, `branch ${id}`, filename);
    entry.locations.forEach((location, index) => {
      assertLocation(location, `branch ${id} location ${index}`, filename);
    });
    if (fileCoverage.b[id].length !== entry.locations.length) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_MAP_INVALID',
        `Coverage branch ${id} for ${filename} does not align with its counters.`,
      );
    }
  }
}

function assertCoverageMap(coverage) {
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      'Coverage artifact must contain an Istanbul coverage map.',
    );
  }
  for (const [filename, fileCoverage] of Object.entries(coverage)) {
    if (!filename || !fileCoverage || typeof fileCoverage !== 'object' ||
        Array.isArray(fileCoverage) || typeof fileCoverage.path !== 'string' ||
        !fileCoverage.statementMap || typeof fileCoverage.statementMap !== 'object' ||
        Array.isArray(fileCoverage.statementMap) ||
        !fileCoverage.fnMap || typeof fileCoverage.fnMap !== 'object' ||
        Array.isArray(fileCoverage.fnMap) ||
        !fileCoverage.branchMap || typeof fileCoverage.branchMap !== 'object' ||
        Array.isArray(fileCoverage.branchMap)) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_MAP_INVALID',
        `Coverage entry ${JSON.stringify(filename)} is not an Istanbul file map.`,
      );
    }
    assertCounterRecord(fileCoverage.s, 'statement counters', filename);
    assertCounterRecord(fileCoverage.f, 'function counters', filename);
    assertCounterRecord(fileCoverage.b, 'branch counters', filename, true);
    assertFileCoverageStructure(fileCoverage, filename);
  }
  return coverage;
}

function assertIdentity(value, label, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_AUTH',
      `Coverage ${label} is invalid.`,
    );
  }
}

function assertCommonFrame(frame, expected) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame) ||
      frame.protocolVersion !== COVERAGE_PROTOCOL_VERSION ||
      frame.generation !== expected.generation ||
      frame.token !== expected.token || frame.producer !== expected.producer) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_AUTH',
      'Coverage frame authentication, generation, or producer is invalid.',
    );
  }
}

function serializeCoverageFrames({ generation, token, producer, coverage }) {
  assertIdentity(generation, 'generation', GENERATION_PATTERN);
  assertIdentity(producer, 'producer', PRODUCER_PATTERN);
  if (typeof token !== 'string' || token.length === 0 || token.length > 512) {
    throw coverageError('METEOR_RSTEST_COVERAGE_AUTH', 'Coverage token is invalid.');
  }
  const artifact = {
    schemaVersion: 1,
    generation,
    producer,
    coverage,
  };
  const serialized = deterministicStringify(artifact);
  if (typeof serialized !== 'string') {
    throw coverageError('METEOR_RSTEST_COVERAGE_JSON', 'Coverage artifact is not JSON-safe.');
  }
  const bytes = utf8Bytes(serialized);
  if (bytes.byteLength > MAX_COVERAGE_BYTES) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_OVERSIZED',
      'Coverage artifact exceeds the 64 MiB limit.',
    );
  }
  const chunks = [];
  for (let offset = 0; offset < bytes.byteLength; offset += COVERAGE_CHUNK_BYTES) {
    chunks.push(bytesToBase64(bytes.subarray(offset, offset + COVERAGE_CHUNK_BYTES)));
  }
  const common = {
    protocolVersion: COVERAGE_PROTOCOL_VERSION,
    generation,
    token,
    producer,
  };
  return [
    { ...common, type: 'begin', size: bytes.byteLength, chunks: chunks.length },
    ...chunks.map((data, sequence) => ({
      ...common,
      type: 'chunk',
      sequence,
      data,
    })),
    { ...common, type: 'commit', size: bytes.byteLength, chunks: chunks.length },
  ];
}

function createCoverageFrameGate({ generation, token, producer }) {
  assertIdentity(generation, 'generation', GENERATION_PATTERN);
  assertIdentity(producer, 'producer', PRODUCER_PATTERN);
  if (typeof token !== 'string' || token.length === 0 || token.length > 512) {
    throw coverageError('METEOR_RSTEST_COVERAGE_AUTH', 'Coverage token is invalid.');
  }
  const expected = { generation, token, producer };
  let declaration;
  let nextSequence = 0;
  let total = 0;
  let chunks = [];
  let committed = false;
  let result;
  let commitError;

  return {
    submit(frame) {
      if (committed) {
        throw coverageError(
          'METEOR_RSTEST_COVERAGE_REPLAY',
          'Coverage producer has already committed this generation.',
        );
      }
      assertCommonFrame(frame, expected);
      if (frame.type === 'begin') {
        if (declaration) {
          throw coverageError(
            'METEOR_RSTEST_COVERAGE_REPLAY',
            'Coverage producer submitted begin more than once.',
          );
        }
        if (!Number.isSafeInteger(frame.size) || frame.size < 0 ||
            !Number.isSafeInteger(frame.chunks) || frame.chunks < 1) {
          throw coverageError(
            'METEOR_RSTEST_COVERAGE_SIZE',
            'Coverage begin declaration is invalid.',
          );
        }
        if (frame.size > MAX_COVERAGE_BYTES) {
          throw coverageError(
            'METEOR_RSTEST_COVERAGE_OVERSIZED',
            'Coverage artifact exceeds the 64 MiB limit.',
          );
        }
        declaration = { size: frame.size, chunks: frame.chunks };
        return { accepted: true, committed: false };
      }
      if (!declaration) {
        throw coverageError(
          'METEOR_RSTEST_COVERAGE_SEQUENCE',
          'Coverage begin frame must be submitted first.',
        );
      }
      if (frame.type === 'chunk') {
        if (!Number.isSafeInteger(frame.sequence) || frame.sequence !== nextSequence ||
            nextSequence >= declaration.chunks) {
          throw coverageError(
            'METEOR_RSTEST_COVERAGE_SEQUENCE',
            'Coverage chunk sequence is out of order.',
          );
        }
        const decoded = base64ToBytes(frame.data);
        if (decoded.byteLength === 0 || decoded.byteLength > COVERAGE_CHUNK_BYTES) {
          throw coverageError(
            'METEOR_RSTEST_COVERAGE_CHUNK',
            'Coverage chunk exceeds the 128 KiB limit.',
          );
        }
        total += decoded.byteLength;
        if (total > declaration.size || total > MAX_COVERAGE_BYTES) {
          throw coverageError(
            'METEOR_RSTEST_COVERAGE_OVERSIZED',
            'Coverage chunks exceed the declared or aggregate size limit.',
          );
        }
        chunks.push(decoded);
        nextSequence += 1;
        return { accepted: true, committed: false };
      }
      if (frame.type !== 'commit') {
        throw coverageError(
          'METEOR_RSTEST_COVERAGE_SEQUENCE',
          'Coverage frame type is invalid.',
        );
      }
      if (frame.size !== declaration.size || frame.chunks !== declaration.chunks ||
          nextSequence !== declaration.chunks || total !== declaration.size) {
        throw coverageError(
          'METEOR_RSTEST_COVERAGE_SIZE',
          'Coverage commit does not match declared and received bytes.',
        );
      }
      committed = true;
      return { accepted: true, committed: true };
    },

    commit() {
      if (!committed) {
        throw coverageError(
          'METEOR_RSTEST_COVERAGE_SEQUENCE',
          'Coverage producer has not submitted a commit frame.',
        );
      }
      if (commitError) throw commitError;
      if (result) return result;
      try {
        const joined = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          joined.set(chunk, offset);
          offset += chunk.byteLength;
        }
        let artifact;
        try {
          artifact = JSON.parse(utf8String(joined));
        } catch (error) {
          throw coverageError(
            'METEOR_RSTEST_COVERAGE_JSON',
            `Coverage artifact is not valid JSON: ${error.message}`,
          );
        }
        if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) ||
            artifact.schemaVersion !== 1 || artifact.generation !== generation ||
            artifact.producer !== producer) {
          throw coverageError(
            'METEOR_RSTEST_COVERAGE_SCHEMA',
            'Coverage artifact schema, generation, or producer is invalid.',
          );
        }
        assertCoverageMap(artifact.coverage);
        result = artifact;
        chunks = [];
        return result;
      } catch (error) {
        commitError = error;
        throw error;
      }
    },
  };
}

module.exports = {
  COVERAGE_CHUNK_BYTES,
  COVERAGE_PROTOCOL_VERSION,
  MAX_COVERAGE_BYTES,
  assertCoverageMap,
  createCoverageFrameGate,
  deterministicStringify,
  serializeCoverageFrames,
};
