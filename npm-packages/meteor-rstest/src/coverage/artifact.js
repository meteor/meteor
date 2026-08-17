const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const MAX_COVERAGE_ARTIFACT_BYTES = 64 * 1024 * 1024;

function artifactError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

function normalizeFileSystemCapabilities(capabilities = {}) {
  return {
    noFollow: capabilities.noFollow ?? (
      Number.isInteger(fs.constants.O_NOFOLLOW) &&
      fs.constants.O_NOFOLLOW !== 0
    ),
    directory: capabilities.directory ??
      Number.isInteger(fs.constants.O_DIRECTORY),
  };
}

function openFlags(baseFlags, capabilities, directory = false) {
  let flags = baseFlags;
  if (capabilities.noFollow) flags |= fs.constants.O_NOFOLLOW;
  if (directory && capabilities.directory) flags |= fs.constants.O_DIRECTORY;
  return flags;
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

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertPathIdentity(filename, expected, { directory = false } = {}) {
  let stat;
  try {
    stat = fs.lstatSync(filename, { bigint: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage path changed while it was open: ${filename}`,
      );
    }
    throw error;
  }
  if (stat.isSymbolicLink() ||
      (directory ? !stat.isDirectory() : !stat.isFile()) ||
      !sameIdentity(stat, expected)) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      `Coverage path identity changed while it was open: ${filename}`,
    );
  }
}

function openPinnedDirectory(directory, capabilities) {
  assertNoSymlinkComponents(directory);
  if (!capabilities.directory) {
    const stat = fs.lstatSync(directory, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage parent is not a directory: ${directory}`,
      );
    }
    assertNoSymlinkComponents(directory);
    assertPathIdentity(directory, stat, { directory: true });
    return { descriptor: undefined, stat };
  }
  const descriptor = fs.openSync(
    directory,
    openFlags(fs.constants.O_RDONLY, capabilities, true),
  );
  try {
    const stat = fs.fstatSync(descriptor, { bigint: true });
    if (!stat.isDirectory()) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage parent is not a directory: ${directory}`,
      );
    }
    assertNoSymlinkComponents(directory);
    assertPathIdentity(directory, stat, { directory: true });
    return { descriptor, stat };
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}

function verifyPinnedDirectory(directory, expected, capabilities) {
  assertNoSymlinkComponents(directory);
  const current = openPinnedDirectory(directory, capabilities);
  try {
    if (!sameIdentity(current.stat, expected)) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage parent identity changed: ${directory}`,
      );
    }
  } finally {
    if (current.descriptor !== undefined) fs.closeSync(current.descriptor);
  }
}

function pinCoverageDirectory({ directory, fileSystemCapabilities }) {
  const capabilities = normalizeFileSystemCapabilities(fileSystemCapabilities);
  const pinned = openPinnedDirectory(directory, capabilities);
  let closed = false;
  return {
    stat: pinned.stat,
    verify() {
      if (closed) {
        throw artifactError(
          'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
          'Coverage directory pin is already closed.',
        );
      }
      verifyPinnedDirectory(directory, pinned.stat, capabilities);
    },
    close() {
      if (closed) return;
      closed = true;
      if (pinned.descriptor !== undefined) fs.closeSync(pinned.descriptor);
    },
  };
}

const PUBLISH_FILE_SCRIPT = `
  const fs = require('node:fs');
  const expectedDevice = BigInt(process.argv[1]);
  const expectedInode = BigInt(process.argv[2]);
  const expectedSourceDevice = BigInt(process.argv[3]);
  const expectedSourceInode = BigInt(process.argv[4]);
  const source = process.argv[5];
  const destination = process.argv[6];
  const useDirectoryOpen = process.argv[7] === '1';
  const useNoFollow = process.argv[8] === '1';
  const sameIdentity = (left, right) =>
    left.dev === right.dev && left.ino === right.ino;
  let descriptor;
  try {
    let parent;
    if (useDirectoryOpen && Number.isInteger(fs.constants.O_DIRECTORY)) {
      let flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY;
      if (useNoFollow && Number.isInteger(fs.constants.O_NOFOLLOW) &&
          fs.constants.O_NOFOLLOW) {
        flags |= fs.constants.O_NOFOLLOW;
      }
      descriptor = fs.openSync('.', flags);
      parent = fs.fstatSync(descriptor, { bigint: true });
    } else {
      parent = fs.lstatSync('.', { bigint: true });
    }
    if (!parent.isDirectory() || parent.dev !== expectedDevice ||
        parent.ino !== expectedInode) process.exit(73);
    const sourceStat = fs.lstatSync(source, { bigint: true });
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink() ||
        sourceStat.dev !== expectedSourceDevice ||
        sourceStat.ino !== expectedSourceInode) process.exit(73);
    try {
      fs.linkSync(source, destination);
    } catch (error) {
      if (error.code === 'EEXIST') process.exit(74);
      throw error;
    }
    const destinationStat = fs.lstatSync(destination, { bigint: true });
    if (!destinationStat.isFile() || destinationStat.isSymbolicLink() ||
        !sameIdentity(destinationStat, sourceStat)) {
      try {
        const currentSource = fs.lstatSync(source, { bigint: true });
        const currentDestination = fs.lstatSync(destination, { bigint: true });
        if (sameIdentity(currentSource, destinationStat) &&
            sameIdentity(currentDestination, destinationStat)) {
          fs.unlinkSync(destination);
        }
      } catch {}
      process.exit(73);
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
`;

function publishPinnedFile({
  directory,
  temporaryPath,
  outputPath,
  parentStat,
  temporaryStat,
  capabilities,
}) {
  const result = childProcess.spawnSync(process.execPath, [
    '-e',
    PUBLISH_FILE_SCRIPT,
    parentStat.dev.toString(),
    parentStat.ino.toString(),
    temporaryStat.dev.toString(),
    temporaryStat.ino.toString(),
    path.basename(temporaryPath),
    path.basename(outputPath),
    capabilities.directory ? '1' : '0',
    capabilities.noFollow ? '1' : '0',
  ], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (result.status === 74) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_REPLAY',
      'Coverage artifact path has already been used.',
    );
  }
  if (result.error || result.status !== 0) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      'Coverage parent changed during atomic publication.',
    );
  }
}

const CLEAN_FILES_DIRECTORY_SCRIPT = `
  const fs = require('node:fs');
  const expectedDevice = BigInt(process.argv[1]);
  const expectedInode = BigInt(process.argv[2]);
  const pattern = new RegExp(process.argv[3], process.argv[4]);
  const useDirectoryOpen = process.argv[5] === '1';
  const useNoFollow = process.argv[6] === '1';
  let descriptor;
  try {
    let directory;
    if (useDirectoryOpen && Number.isInteger(fs.constants.O_DIRECTORY)) {
      let flags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY;
      if (useNoFollow && Number.isInteger(fs.constants.O_NOFOLLOW) &&
          fs.constants.O_NOFOLLOW) {
        flags |= fs.constants.O_NOFOLLOW;
      }
      descriptor = fs.openSync('.', flags);
      directory = fs.fstatSync(descriptor, { bigint: true });
    } else {
      directory = fs.lstatSync('.', { bigint: true });
    }
    if (!directory.isDirectory() || directory.dev !== expectedDevice ||
        directory.ino !== expectedInode) process.exit(73);
    const entries = fs.readdirSync('.');
    for (const entry of entries) {
      pattern.lastIndex = 0;
      const stat = fs.lstatSync(entry, { bigint: true });
      if (!pattern.test(entry) || !stat.isFile() || stat.isSymbolicLink()) {
        process.exit(73);
      }
    }
    for (const entry of entries) fs.unlinkSync(entry);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
`;

function cleanupCoverageFilesDirectory({
  directory,
  entryPattern,
  fileSystemCapabilities,
}) {
  if (!path.isAbsolute(directory || '') || !(entryPattern instanceof RegExp)) {
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      'Coverage cleanup directory or entry pattern is invalid.',
    );
  }
  const capabilities = normalizeFileSystemCapabilities(fileSystemCapabilities);
  let pinned;
  try {
    pinned = openPinnedDirectory(directory, capabilities);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  try {
    verifyPinnedDirectory(directory, pinned.stat, capabilities);
    const result = childProcess.spawnSync(process.execPath, [
      '-e',
      CLEAN_FILES_DIRECTORY_SCRIPT,
      pinned.stat.dev.toString(),
      pinned.stat.ino.toString(),
      entryPattern.source,
      entryPattern.flags,
      capabilities.directory ? '1' : '0',
      capabilities.noFollow ? '1' : '0',
    ], {
      cwd: directory,
      encoding: 'utf8',
    });
    if (result.error || result.status !== 0) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        'Coverage directory changed during safe cleanup.',
      );
    }
    verifyPinnedDirectory(directory, pinned.stat, capabilities);
    if (fs.readdirSync(directory).length !== 0) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        'Coverage directory changed during safe cleanup.',
      );
    }
  } finally {
    if (pinned.descriptor !== undefined) fs.closeSync(pinned.descriptor);
  }
  assertNoSymlinkComponents(directory);
  assertPathIdentity(directory, pinned.stat, { directory: true });
  fs.rmdirSync(directory);
  return true;
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

function openBoundedRegularFile(
  filePath,
  label,
  capabilitiesInput,
  expectedParentStat,
) {
  const capabilities = normalizeFileSystemCapabilities(capabilitiesInput);
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
  const directory = path.dirname(filePath);
  let parent;
  try {
    parent = openPinnedDirectory(directory, capabilities);
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
  if (expectedParentStat && !sameIdentity(parent.stat, expectedParentStat)) {
    if (parent.descriptor !== undefined) fs.closeSync(parent.descriptor);
    throw artifactError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      `Coverage parent identity changed: ${directory}`,
    );
  }
  try {
    descriptor = fs.openSync(
      filePath,
      openFlags(fs.constants.O_RDONLY, capabilities),
    );
  } catch (error) {
    if (parent.descriptor !== undefined) fs.closeSync(parent.descriptor);
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
    const stat = fs.fstatSync(descriptor, { bigint: true });
    if (!stat.isFile()) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Expected ${label.toLowerCase()} is not a file: ${filePath}`,
      );
    }
    if (stat.size > BigInt(MAX_COVERAGE_ARTIFACT_BYTES)) {
      throw artifactError(
        'METEOR_RSTEST_COVERAGE_OVERSIZED',
        `${label} exceeds the 64 MiB limit.`,
      );
    }
    verifyPinnedDirectory(directory, parent.stat, capabilities);
    assertNoSymlinkComponents(filePath);
    assertPathIdentity(filePath, stat);
    const contents = readBoundedDescriptor(descriptor, label);
    verifyPinnedDirectory(directory, parent.stat, capabilities);
    assertPathIdentity(filePath, stat);
    return contents;
  } finally {
    fs.closeSync(descriptor);
    if (parent.descriptor !== undefined) fs.closeSync(parent.descriptor);
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

function isUnknownFunctionDeclarationLocation(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    value.start && typeof value.start === 'object' && !Array.isArray(value.start) &&
    value.end && typeof value.end === 'object' && !Array.isArray(value.end) &&
    value.start.line === 0 && value.start.column === 0 &&
    value.end.line === 0 && value.end.column === 0;
}

function assertFunctionDeclarationLocation(value, field, filename) {
  // swc-plugin-coverage-instrument uses this sentinel when an anonymous
  // object-method declaration has no source declaration span.
  if (isUnknownFunctionDeclarationLocation(value)) return;
  assertLocation(value, field, filename);
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
    assertFunctionDeclarationLocation(entry.decl, `function ${id} declaration`, filename);
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

function writeCoverageArtifact({
  outputPath,
  expectedPath,
  artifact,
  fileSystemCapabilities,
}) {
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
  const capabilities = normalizeFileSystemCapabilities(fileSystemCapabilities);
  const parent = openPinnedDirectory(directory, capabilities);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  let descriptor;
  let temporaryStat;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    temporaryStat = fs.fstatSync(descriptor, { bigint: true });
    verifyPinnedDirectory(directory, parent.stat, capabilities);
    assertPathIdentity(temporaryPath, temporaryStat);
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.fchmodSync(descriptor, 0o600);
    assertNoSymlinkComponents(directory);
    publishPinnedFile({
      directory,
      temporaryPath,
      outputPath,
      parentStat: parent.stat,
      temporaryStat,
      capabilities,
    });
    verifyPinnedDirectory(directory, parent.stat, capabilities);
    assertPathIdentity(temporaryPath, temporaryStat);
    assertPathIdentity(outputPath, temporaryStat);
    fs.unlinkSync(temporaryPath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (parent.descriptor !== undefined) fs.closeSync(parent.descriptor);
    try {
      const current = fs.lstatSync(temporaryPath, { bigint: true });
      if (temporaryStat && sameIdentity(current, temporaryStat)) {
        fs.unlinkSync(temporaryPath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function readCoverageArtifact({
  filePath,
  expectedPath,
  generation,
  producer,
  consumed = new Set(),
  fileSystemCapabilities,
  expectedParentStat,
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
      fileSystemCapabilities,
      expectedParentStat,
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

function readCoverageManifest({
  filePath,
  expectedPath,
  fileSystemCapabilities,
}) {
  assertExactPath(filePath, expectedPath);
  try {
    return JSON.parse(openBoundedRegularFile(
      filePath,
      'Coverage manifest',
      fileSystemCapabilities,
    ));
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
  cleanupCoverageFilesDirectory,
  pinCoverageDirectory,
  readCoverageArtifact,
  readCoverageManifest,
  validateCoverageArtifact,
  writeCoverageArtifact,
};
