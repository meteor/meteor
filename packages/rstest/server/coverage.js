const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  MAX_COVERAGE_BYTES,
  assertCoverageMap,
  createCoverageFrameGate,
  deterministicStringify,
} = require('../runtime/coverage-protocol.js');

const GENERATION_PATTERN = /^[a-f0-9]{32,128}$/i;
const PRODUCER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_FRAME_BODY_BYTES = 256 * 1024;

function coverageError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (
    relative !== '..' && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function assertNoSymlinkComponents(filename, { allowMissing = false } = {}) {
  const absolute = path.resolve(filename);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
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
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Coverage path contains a symbolic-link component: ${current}`,
      );
    }
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

const PUBLISH_FILE_SCRIPT = `
  const fs = require('node:fs');
  const expectedDevice = BigInt(process.argv[1]);
  const expectedInode = BigInt(process.argv[2]);
  const expectedSourceDevice = BigInt(process.argv[3]);
  const expectedSourceInode = BigInt(process.argv[4]);
  const source = process.argv[5];
  const destination = process.argv[6];
  const sameIdentity = (left, right) =>
    left.dev === right.dev && left.ino === right.ino;
  let flags = fs.constants.O_RDONLY;
  if (Number.isInteger(fs.constants.O_DIRECTORY)) flags |= fs.constants.O_DIRECTORY;
  if (Number.isInteger(fs.constants.O_NOFOLLOW) && fs.constants.O_NOFOLLOW) {
    flags |= fs.constants.O_NOFOLLOW;
  }
  let descriptor;
  try {
    descriptor = fs.openSync('.', flags);
    const parent = fs.fstatSync(descriptor, { bigint: true });
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
      // A successful link followed by an identity mismatch means the source
      // pathname raced. Remove only when both current names still prove they
      // reference the same unexpected inode installed by this link.
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
  ], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (result.status === 74) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_REPLAY',
      'Coverage artifact path has already been used.',
    );
  }
  if (result.error || result.status !== 0) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      'Coverage artifact parent changed during atomic publication.',
    );
  }
}

function validateArtifactPath({ outputPath, expectedPath, generation, producer }) {
  if (typeof outputPath !== 'string' || typeof expectedPath !== 'string' ||
      !path.isAbsolute(outputPath) || !path.isAbsolute(expectedPath) ||
      path.resolve(outputPath) !== path.resolve(expectedPath) ||
      !GENERATION_PATTERN.test(generation) || !PRODUCER_PATTERN.test(producer) ||
      path.basename(outputPath) !== `${producer}.json` ||
      path.basename(path.dirname(outputPath)) !== generation) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
      'Coverage artifact path is not bound to its expected producer and generation.',
    );
  }
}

function writeCoverageArtifact({ outputPath, expectedPath, artifact }) {
  validateArtifactPath({
    outputPath,
    expectedPath,
    generation: artifact && artifact.generation,
    producer: artifact && artifact.producer,
  });
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) ||
      artifact.schemaVersion !== 1) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_SCHEMA',
      'Coverage artifact has an unsupported schema version.',
    );
  }
  assertCoverageMap(artifact.coverage);
  const serialized = deterministicStringify(artifact);
  if (new TextEncoder().encode(serialized).byteLength > MAX_COVERAGE_BYTES) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_OVERSIZED',
      'Coverage artifact exceeds the 64 MiB limit.',
    );
  }

  const directory = path.dirname(outputPath);
  assertNoSymlinkComponents(directory, { allowMissing: true });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertNoSymlinkComponents(directory);
  fs.chmodSync(directory, 0o700);
  assertNoSymlinkComponents(outputPath, { allowMissing: true });
  if (fs.existsSync(outputPath)) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_REPLAY',
      'Coverage artifact path has already been used.',
    );
  }

  const parentRealPath = fs.realpathSync(directory);
  const parentStat = fs.statSync(parentRealPath, { bigint: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.` +
      `${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  let descriptor;
  let temporaryStat;
  try {
    let flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL;
    if (Number.isInteger(fs.constants.O_NOFOLLOW) && fs.constants.O_NOFOLLOW) {
      flags |= fs.constants.O_NOFOLLOW;
    }
    descriptor = fs.openSync(temporaryPath, flags, 0o600);
    temporaryStat = fs.fstatSync(descriptor, { bigint: true });
    if (!temporaryStat.isFile()) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        'Coverage temporary artifact is not a regular file.',
      );
    }
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.fchmodSync(descriptor, 0o600);
    assertNoSymlinkComponents(directory);
    const currentParent = fs.statSync(fs.realpathSync(directory), { bigint: true });
    if (fs.realpathSync(directory) !== parentRealPath ||
        !sameIdentity(currentParent, parentStat)) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        'Coverage artifact parent changed during publication.',
      );
    }
    publishPinnedFile({
      directory,
      temporaryPath,
      outputPath,
      parentStat,
      temporaryStat,
    });
    assertNoSymlinkComponents(directory);
    const publishedParent = fs.statSync(fs.realpathSync(directory), { bigint: true });
    if (fs.realpathSync(directory) !== parentRealPath ||
        !sameIdentity(publishedParent, parentStat)) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        'Coverage artifact parent changed during atomic publication.',
      );
    }
    const outputStat = fs.lstatSync(outputPath, { bigint: true });
    if (!outputStat.isFile() || outputStat.isSymbolicLink() ||
        !sameIdentity(outputStat, temporaryStat)) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        'Coverage artifact changed during atomic publication.',
      );
    }
    fs.unlinkSync(temporaryPath);
    const directoryDescriptor = fs.openSync(directory, fs.constants.O_RDONLY);
    try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      const current = fs.lstatSync(temporaryPath, { bigint: true });
      if (!temporaryStat || sameIdentity(current, temporaryStat)) {
        fs.unlinkSync(temporaryPath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return artifact;
}

function cloneCoverageMap(value) {
  const clone = value === undefined
    ? {}
    : JSON.parse(deterministicStringify(value));
  return assertCoverageMap(clone);
}

function safeTokenEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length &&
    crypto.timingSafeEqual(leftBytes, rightBytes);
}

function requestIsSameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    const parsed = new URL(origin);
    const forwardedProtocol = String(
      request.headers['x-forwarded-proto'] || '',
    ).split(',', 1)[0].trim();
    const protocol = forwardedProtocol
      ? `${forwardedProtocol.replace(/:$/, '')}:`
      : request.socket && request.socket.encrypted ? 'https:' : 'http:';
    return parsed.host === host && parsed.protocol === protocol;
  } catch {
    return false;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  // The HTTP producer can fail before the server test lifecycle begins its
  // wait. Mark the rejection observed without changing what later waiters see.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

function validateCoverageMetadata(coverage) {
  if (!coverage || coverage.enabled !== true ||
      typeof coverage.generation !== 'string' ||
      !GENERATION_PATTERN.test(coverage.generation) ||
      typeof coverage.token !== 'string' || coverage.token.length === 0 ||
      coverage.token.length > 512 ||
      typeof coverage.endpoint !== 'string' ||
      coverage.endpoint !== '/__meteor__/rstest/coverage' ||
      typeof coverage.artifactRoot !== 'string' ||
      !path.isAbsolute(coverage.artifactRoot) ||
      path.basename(path.resolve(coverage.artifactRoot)) !== coverage.generation ||
      !coverage.artifacts || typeof coverage.artifacts !== 'object' ||
      Array.isArray(coverage.artifacts)) {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_SCHEMA',
      'Runtime coverage metadata is invalid or stale.',
    );
  }
  const root = path.resolve(coverage.artifactRoot);
  for (const [producer, artifactPath] of Object.entries(coverage.artifacts)) {
    if (!PRODUCER_PATTERN.test(producer) || typeof artifactPath !== 'string' ||
        !path.isAbsolute(artifactPath) ||
        path.dirname(path.resolve(artifactPath)) !== root ||
        path.basename(artifactPath) !== `${producer}.json`) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        'Runtime coverage artifact descriptor is invalid.',
      );
    }
  }
  return coverage;
}

function createServerCoverageLifecycle({
  coverage,
  expectsClient = false,
  expectsExternal = false,
  worker = null,
  globalObject = globalThis,
  timeoutMs = 600000,
}) {
  if (!coverage || coverage.enabled !== true) {
    return {
      enabled: false,
      handler: null,
      captureServer: () => ({ captured: false }),
      waitForClient: async () => undefined,
      waitForExternal: async () => undefined,
    };
  }
  validateCoverageMetadata(coverage);
  const producers = new Map();
  for (const [producer, expected] of [
    ['client', expectsClient],
    ['e2e', expectsExternal],
  ]) {
    if (!expected) continue;
    if (!coverage.artifacts[producer]) {
      throw coverageError(
        'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
        `Expected coverage artifact descriptor for ${producer} is missing.`,
      );
    }
    producers.set(producer, {
      producer,
      deferred: createDeferred(),
      waitTimer: undefined,
      settled: false,
      committed: false,
      gate: createCoverageFrameGate({
        generation: coverage.generation,
        token: coverage.token,
        producer,
      }),
    });
  }

  function clearWaitTimer(state) {
    if (!state.waitTimer) return;
    clearTimeout(state.waitTimer);
    state.waitTimer = undefined;
  }

  function failProducer(state, error) {
    if (!state || state.settled) return;
    state.settled = true;
    clearWaitTimer(state);
    state.deferred.reject(error);
  }

  function failPending(error) {
    for (const state of producers.values()) failProducer(state, error);
  }

  function completeProducer(state, artifact) {
    if (state.settled) return;
    state.committed = true;
    state.settled = true;
    clearWaitTimer(state);
    state.deferred.resolve(artifact);
  }

  const handler = producers.size > 0 ? (request, response, next = () => {}) => {
    if (request.method !== 'POST') return next();
    if (!requestIsSameOrigin(request) ||
        !safeTokenEqual(request.headers['x-meteor-rstest-token'], coverage.token)) {
      sendJson(response, 403, { error: 'Coverage request is not authorized.' });
      return;
    }
    const contentType = String(request.headers['content-type'] || '').split(';', 1)[0];
    if (contentType !== 'application/json') {
      const error = coverageError(
        'METEOR_RSTEST_COVERAGE_CONTENT_TYPE',
        'Coverage request must be JSON.',
      );
      failPending(error);
      sendJson(response, 415, { error: error.message });
      return;
    }
    const chunks = [];
    let size = 0;
    let oversized = false;
    request.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_FRAME_BODY_BYTES) {
        oversized = true;
        chunks.length = 0;
      } else if (!oversized) {
        chunks.push(Buffer.from(chunk));
      }
    });
    request.on('end', () => {
      if (oversized) {
        const error = coverageError(
          'METEOR_RSTEST_COVERAGE_OVERSIZED',
          'Coverage frame exceeds the request limit.',
        );
        failPending(error);
        sendJson(response, 413, { error: error.message });
        return;
      }
      let state;
      try {
        const frame = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        state = producers.get(frame && frame.producer);
        if (!state) {
          throw coverageError(
            'METEOR_RSTEST_COVERAGE_AUTH',
            'Coverage frame producer is not expected.',
          );
        }
        if (state.settled) {
          sendJson(response, 409, {
            error: state.committed
              ? 'Coverage producer has already committed.'
              : 'Coverage producer has already failed.',
          });
          return;
        }
        const accepted = state.gate.submit(frame);
        if (accepted.committed) {
          const artifact = state.gate.commit();
          writeCoverageArtifact({
            outputPath: coverage.artifacts[state.producer],
            expectedPath: coverage.artifacts[state.producer],
            artifact,
          });
          completeProducer(state, artifact);
        }
        sendJson(response, 200, accepted);
      } catch (error) {
        const replay = error.code === 'METEOR_RSTEST_COVERAGE_REPLAY';
        if (state) failProducer(state, error);
        else failPending(error);
        sendJson(response, replay ? 409 : 400, { error: error.message });
      }
    });
    request.on('error', failPending);
  } : null;

  function waitForProducer(producer) {
    const state = producers.get(producer);
    if (!state) return Promise.resolve();
    if (!state.settled && !state.waitTimer) {
      const label = producer === 'client' ? 'Meteor client' : 'external e2e';
      state.waitTimer = setTimeout(() => {
        failProducer(state, coverageError(
          'METEOR_RSTEST_COVERAGE_TIMEOUT',
          `Did not receive ${label} coverage commit after ${timeoutMs}ms.`,
        ));
      }, timeoutMs);
    }
    return state.deferred.promise;
  }

  return {
    enabled: true,
    handler,
    captureServer() {
      const producer = worker ? `worker-${worker.id}` : 'server';
      const outputPath = worker && worker.coveragePath || coverage.artifacts[producer];
      if (!outputPath || !inside(path.resolve(coverage.artifactRoot), path.resolve(outputPath))) {
        throw coverageError(
          'METEOR_RSTEST_COVERAGE_PATH_MISMATCH',
          `Expected coverage artifact for ${producer} is missing.`,
        );
      }
      const artifact = {
        schemaVersion: 1,
        generation: coverage.generation,
        producer,
        coverage: cloneCoverageMap(globalObject.__coverage__),
      };
      writeCoverageArtifact({ outputPath, expectedPath: outputPath, artifact });
      return { captured: true, artifact };
    },
    waitForClient() {
      return waitForProducer('client');
    },
    waitForExternal() {
      return waitForProducer('e2e');
    },
  };
}

module.exports = {
  cloneCoverageMap,
  createServerCoverageLifecycle,
  validateCoverageMetadata,
  writeCoverageArtifact,
};
