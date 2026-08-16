const fs = require('node:fs');
const path = require('node:path');

const MAX_COVERAGE_ARTIFACT_BYTES = 64 * 1024 * 1024;

function artifactError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

function noFollowFlags(baseFlags) {
  if (!Number.isInteger(fs.constants.O_NOFOLLOW) ||
      fs.constants.O_NOFOLLOW === 0) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      'This platform does not provide no-follow file opens for coverage IO.',
    );
  }
  return baseFlags | fs.constants.O_NOFOLLOW;
}

function assertExactPath(filePath, expectedPath) {
  if (typeof filePath !== 'string' || typeof expectedPath !== 'string' ||
      !path.isAbsolute(filePath) || !path.isAbsolute(expectedPath) ||
      path.resolve(filePath) !== path.resolve(expectedPath)) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      'Coverage artifact path does not match its explicit expected path.',
    );
  }
}

function assertNoSymlinkComponents(filePath, { allowMissing = false } = {}) {
  const absolute = path.resolve(filePath);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const components = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      if (path.dirname(current) === parsed.root) {
        current = fs.realpathSync(current);
        continue;
      }
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage path contains a symbolic-link component: ${current}`,
      );
    }
    if (index < components.length - 1 && !stat.isDirectory()) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage path parent is not a directory: ${current}`,
      );
    }
  }
}

function createPrivateDirectory(directory) {
  assertNoSymlinkComponents(directory, { allowMissing: true });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertNoSymlinkComponents(directory);
  fs.chmodSync(directory, 0o700);
}

function readBoundedDescriptor(descriptor, label) {
  const chunks = [];
  let total = 0;
  for (;;) {
    const remaining = MAX_COVERAGE_ARTIFACT_BYTES + 1 - total;
    if (remaining <= 0) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_OVERSIZED',
        `${label} exceeds the 64 MiB limit.`,
      );
    }
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
    const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
    if (count === 0) return Buffer.concat(chunks, total).toString('utf8');
    chunks.push(chunk.subarray(0, count));
    total += count;
  }
}

function openBoundedRegularFile(filePath, label) {
  try {
    assertNoSymlinkComponents(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_MISSING',
        `Expected ${label.toLowerCase()} is missing: ${filePath}`,
      );
    }
    throw error;
  }
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, noFollowFlags(fs.constants.O_RDONLY));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_MISSING',
        `Expected ${label.toLowerCase()} is missing: ${filePath}`,
      );
    }
    if (error.code === 'ELOOP') {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Expected ${label.toLowerCase()} is a symbolic link: ${filePath}`,
      );
    }
    throw error;
  }
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Expected ${label.toLowerCase()} is not a file: ${filePath}`,
      );
    }
    if (stat.size > MAX_COVERAGE_ARTIFACT_BYTES) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_OVERSIZED',
        `${label} exceeds the 64 MiB limit.`,
      );
    }
    return readBoundedDescriptor(descriptor, label);
  } finally {
    fs.closeSync(descriptor);
  }
}

function isCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertCounterRecord(value, field, filename, arrays = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} must be an object.`,
    );
  }
  for (const counter of Object.values(value)) {
    const valid = arrays
      ? Array.isArray(counter) && counter.every(isCounter)
      : isCounter(counter);
    if (!valid) {
      throw artifactError(
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
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} contains an invalid position.`,
    );
  }
}

function assertLocation(value, field, filename) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} contains an invalid location.`,
    );
  }
  assertPosition(value.start, field, filename);
  assertPosition(value.end, field, filename);
  if (value.end.line < value.start.line ||
      value.end.line === value.start.line && value.end.column < value.start.column) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} contains a reversed location.`,
    );
  }
}

function assertAlignedKeys(map, counters, field, filename) {
  const mapKeys = Object.keys(map).sort();
  const counterKeys = Object.keys(counters).sort();
  if (mapKeys.some(key => !/^(?:0|[1-9]\d*)$/.test(key) ||
      !Number.isSafeInteger(Number(key)))) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_MAP_INVALID',
      `Coverage ${field} for ${filename} contains an invalid map identifier.`,
    );
  }
  if (mapKeys.length !== counterKeys.length ||
      mapKeys.some((key, index) => key !== counterKeys[index])) {
    throw artifactError(
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
      throw artifactError(
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
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_MAP_INVALID',
        `Coverage branch ${id} for ${filename} is invalid.`,
      );
    }
    if (entry.loc !== undefined) assertLocation(entry.loc, `branch ${id}`, filename);
    entry.locations.forEach((location, index) => {
      assertLocation(location, `branch ${id} location ${index}`, filename);
    });
    if (fileCoverage.b[id].length !== entry.locations.length) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_MAP_INVALID',
        `Coverage branch ${id} for ${filename} does not align with its counters.`,
      );
    }
  }
}

function assertCoverageMap(coverage) {
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
    throw artifactError(
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
      throw artifactError(
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

function validateCoverageArtifact(artifact, { generation, producer }) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) ||
      artifact.schemaVersion !== 1) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_SCHEMA',
      'Coverage artifact has an unsupported schema version.',
    );
  }
  if (artifact.generation !== generation) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_STALE',
      'Ignored a stale coverage artifact from another generation.',
    );
  }
  if (artifact.producer !== producer) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_PRODUCER',
      'Coverage artifact producer does not match its expected producer.',
    );
  }
  assertCoverageMap(artifact.coverage);
  return artifact;
}

function writeCoverageArtifact({ outputPath, expectedPath, artifact }) {
  assertExactPath(outputPath, expectedPath);
  validateCoverageArtifact(artifact, {
    generation: artifact && artifact.generation,
    producer: artifact && artifact.producer,
  });
  const serialized = JSON.stringify(artifact);
  if (Buffer.byteLength(serialized) > MAX_COVERAGE_ARTIFACT_BYTES) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_OVERSIZED',
      'Coverage artifact exceeds the 64 MiB limit.',
    );
  }
  const directory = path.dirname(outputPath);
  createPrivateDirectory(directory);
  assertNoSymlinkComponents(outputPath, { allowMissing: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.fchmodSync(descriptor, 0o600);
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertNoSymlinkComponents(directory);
    try {
      fs.linkSync(temporaryPath, outputPath);
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw artifactError(
          'METEOR_RSTEST_COVERAGE_REPLAY',
          'Coverage artifact path has already been used.',
        );
      }
      throw error;
    }
    fs.unlinkSync(temporaryPath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {}
  }
}

function readCoverageArtifact({
  filePath,
  expectedPath,
  generation,
  producer,
  consumed = new Set(),
}) {
  assertExactPath(filePath, expectedPath);
  const canonicalPath = path.resolve(filePath);
  if (consumed.has(canonicalPath)) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_REPLAY',
      'Coverage artifact was consumed more than once.',
    );
  }
  let artifact;
  try {
    artifact = JSON.parse(openBoundedRegularFile(
      canonicalPath,
      'Coverage artifact',
    ));
  } catch (error) {
    if (error.code && error.code.startsWith('METEOR_RSTEST_')) throw error;
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_SCHEMA',
      `Coverage artifact is not valid JSON: ${error.message}`,
    );
  }
  validateCoverageArtifact(artifact, { generation, producer });
  consumed.add(canonicalPath);
  return artifact;
}

function readCoverageManifest({ filePath, expectedPath }) {
  assertExactPath(filePath, expectedPath);
  try {
    return JSON.parse(openBoundedRegularFile(filePath, 'Coverage manifest'));
  } catch (error) {
    if (error.code && error.code.startsWith('METEOR_RSTEST_')) throw error;
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_SCHEMA',
      `Coverage manifest is not valid JSON: ${error.message}`,
    );
  }
}

module.exports = {
  MAX_COVERAGE_ARTIFACT_BYTES,
  assertNoSymlinkComponents,
  assertCoverageMap,
  readCoverageArtifact,
  readCoverageManifest,
  validateCoverageArtifact,
  writeCoverageArtifact,
};
