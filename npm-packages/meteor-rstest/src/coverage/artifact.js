const fs = require('node:fs');
const path = require('node:path');

const MAX_COVERAGE_ARTIFACT_BYTES = 64 * 1024 * 1024;

function artifactError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
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
  if (fs.existsSync(outputPath)) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_REPLAY',
      'Coverage artifact path has already been used.',
    );
  }

  const directory = path.dirname(outputPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.chmodSync(temporaryPath, 0o600);
    if (fs.existsSync(outputPath)) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_REPLAY',
        'Coverage artifact path has already been used.',
      );
    }
    fs.renameSync(temporaryPath, outputPath);
    fs.chmodSync(outputPath, 0o600);
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
  let stat;
  try {
    stat = fs.lstatSync(canonicalPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_MISSING',
        `Expected coverage artifact is missing: ${canonicalPath}`,
      );
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      `Expected coverage artifact is not a file: ${canonicalPath}`,
    );
  }
  if (stat.size > MAX_COVERAGE_ARTIFACT_BYTES) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_OVERSIZED',
      'Coverage artifact exceeds the 64 MiB limit.',
    );
  }
  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  } catch (error) {
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
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_MISSING',
        `Expected coverage manifest is missing: ${filePath}`,
      );
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      `Expected coverage manifest is not a file: ${filePath}`,
    );
  }
  if (stat.size > MAX_COVERAGE_ARTIFACT_BYTES) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_OVERSIZED',
      'Coverage manifest exceeds the 64 MiB limit.',
    );
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_SCHEMA',
      `Coverage manifest is not valid JSON: ${error.message}`,
    );
  }
}

module.exports = {
  MAX_COVERAGE_ARTIFACT_BYTES,
  assertCoverageMap,
  readCoverageArtifact,
  readCoverageManifest,
  validateCoverageArtifact,
  writeCoverageArtifact,
};
