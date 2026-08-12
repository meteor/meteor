const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { validateResult } = require('../../runtime/coordinator.js');
const { formatRuntimeReport } = require('../../runtime/reporter.js');

const WORKER_PAYLOAD_SCHEMA_VERSION = 1;
const GENERATION_PATTERN = /^[a-f0-9]{32,128}$/i;

function workerError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

function canonicalRuntimeServerFiles({ appDir, files }) {
  if (!path.isAbsolute(appDir || '')) {
    throw workerError(
      'METEOR_RSTEST_WORKER_APP_ROOT',
      'Runtime worker app root must be absolute.'
    );
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw workerError(
      'METEOR_RSTEST_WORKER_EMPTY',
      'Runtime workers require at least one runtime-server file.'
    );
  }
  const realAppDir = fs.realpathSync(appDir);
  const seen = new Set();
  const normalized = files.map(file => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) {
      throw workerError(
        'METEOR_RSTEST_WORKER_FILE',
        'Runtime worker files must be absolute paths.'
      );
    }
    let canonical;
    try {
      canonical = fs.realpathSync(file);
    } catch {
      throw workerError(
        'METEOR_RSTEST_WORKER_FILE',
        `Runtime worker file does not exist: ${file}`
      );
    }
    if (!inside(realAppDir, canonical)) {
      throw workerError(
        'METEOR_RSTEST_WORKER_FILE',
        `Runtime worker file must be inside Meteor app root: ${file}`
      );
    }
    if (seen.has(canonical)) {
      throw workerError(
        'METEOR_RSTEST_WORKER_DUPLICATE',
        'Runtime worker files must be unique.'
      );
    }
    seen.add(canonical);
    return canonical;
  });
  normalized.sort((left, right) => {
    const leftRelative = path.relative(realAppDir, left).split(path.sep).join('/');
    const rightRelative = path.relative(realAppDir, right).split(path.sep).join('/');
    return leftRelative.localeCompare(rightRelative);
  });
  return normalized;
}

function partitionRuntimeFiles({ appDir, files, requestedWorkers }) {
  if (!Number.isSafeInteger(requestedWorkers) || requestedWorkers < 1) {
    throw workerError(
      'METEOR_RSTEST_WORKER_COUNT',
      'Runtime worker count must be a positive integer.'
    );
  }
  const normalized = canonicalRuntimeServerFiles({ appDir, files });
  const count = Math.min(requestedWorkers, normalized.length);
  const partitions = Array.from({ length: count }, () => []);
  normalized.forEach((file, index) => {
    partitions[index % count].push(file);
  });
  return partitions;
}

function removeIfPresent(filename) {
  try {
    fs.unlinkSync(filename);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function writePrivateJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(temporary, filename);
    fs.chmodSync(filename, 0o600);
  } catch (error) {
    removeIfPresent(temporary);
    throw error;
  }
}

function assertGeneration(generation) {
  if (typeof generation !== 'string' || !GENERATION_PATTERN.test(generation)) {
    throw workerError(
      'METEOR_RSTEST_WORKER_GENERATION',
      'Runtime worker generation is invalid.'
    );
  }
}

function createRstestHostDescriptors({
  appDir,
  localDir,
  files,
  requestedWorkers,
  generation,
  runtimeSettingsPath,
}) {
  if (!path.isAbsolute(localDir || '') ||
      !path.isAbsolute(runtimeSettingsPath || '')) {
    throw workerError(
      'METEOR_RSTEST_WORKER_PATH',
      'Runtime worker coordination paths must be absolute.'
    );
  }
  assertGeneration(generation);
  const partitions = partitionRuntimeFiles({ appDir, files, requestedWorkers });
  const workersRoot = path.join(localDir, 'rstest', 'workers');
  const descriptors = partitions.map((runtimeFiles, index) => {
    const id = `server-${index + 1}`;
    const runtimeManifest = path.join(workersRoot, `${id}-files.json`);
    const resultPath = path.join(workersRoot, `${id}-result.json`);
    writePrivateJson(runtimeManifest, {
      schemaVersion: 2,
      serverFiles: runtimeFiles,
      clientFiles: [],
    });
    removeIfPresent(resultPath);
    return Object.freeze({
      id,
      payload: Object.freeze({
        schemaVersion: WORKER_PAYLOAD_SCHEMA_VERSION,
        generation,
        runtimeFiles: Object.freeze([...runtimeFiles]),
        runtimeManifest,
        runtimeSettingsPath,
        resultPath,
      }),
    });
  });
  return Object.freeze({
    requestedWorkers,
    actualWorkers: descriptors.length,
    descriptors: Object.freeze(descriptors),
  });
}

function validateCoordinationPath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw workerError(
      'METEOR_RSTEST_WORKER_PATH',
      `Runtime worker ${label} path must be absolute.`
    );
  }
  return path.normalize(value);
}

function validateRstestWorkerPayload({ appDir, worker }) {
  if (!worker || typeof worker !== 'object' || Array.isArray(worker) ||
      typeof worker.id !== 'string') {
    throw workerError(
      'METEOR_RSTEST_WORKER_IDENTITY',
      'Runtime worker identity is invalid.'
    );
  }
  const payload = worker.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      payload.schemaVersion !== WORKER_PAYLOAD_SCHEMA_VERSION) {
    throw workerError(
      'METEOR_RSTEST_WORKER_SCHEMA',
      'Runtime worker payload schema is invalid.'
    );
  }
  assertGeneration(payload.generation);
  const runtimeFiles = canonicalRuntimeServerFiles({
    appDir,
    files: payload.runtimeFiles,
  });
  const runtimeManifest = validateCoordinationPath(
    payload.runtimeManifest,
    'manifest'
  );
  const runtimeSettingsPath = validateCoordinationPath(
    payload.runtimeSettingsPath,
    'settings'
  );
  const resultPath = validateCoordinationPath(payload.resultPath, 'result');
  if (path.basename(runtimeManifest) !== `${worker.id}-files.json`) {
    throw workerError(
      'METEOR_RSTEST_WORKER_PATH',
      'Runtime worker manifest path does not match worker identity.'
    );
  }
  if (path.basename(resultPath) !== `${worker.id}-result.json`) {
    throw workerError(
      'METEOR_RSTEST_WORKER_PATH',
      'Runtime worker result path does not match worker identity.'
    );
  }
  const coordinationRoot = path.dirname(path.dirname(runtimeManifest));
  if (path.dirname(runtimeSettingsPath) !== coordinationRoot ||
      path.dirname(resultPath) !== path.dirname(runtimeManifest)) {
    throw workerError(
      'METEOR_RSTEST_WORKER_PATH',
      'Runtime worker coordination paths do not share one root.'
    );
  }
  let manifestFiles;
  try {
    const parsedManifest = JSON.parse(fs.readFileSync(runtimeManifest, 'utf8'));
    const files = Array.isArray(parsedManifest)
      ? parsedManifest
      : parsedManifest && parsedManifest.schemaVersion === 2 &&
          Array.isArray(parsedManifest.serverFiles) &&
          Array.isArray(parsedManifest.clientFiles) &&
          parsedManifest.clientFiles.length === 0
        ? parsedManifest.serverFiles
        : null;
    manifestFiles = canonicalRuntimeServerFiles({ appDir, files });
  } catch (error) {
    throw workerError(
      'METEOR_RSTEST_WORKER_MANIFEST',
      `Runtime worker manifest is invalid: ${error.message}`
    );
  }
  if (JSON.stringify(manifestFiles) !== JSON.stringify(runtimeFiles)) {
    throw workerError(
      'METEOR_RSTEST_WORKER_MANIFEST',
      'Runtime worker manifest does not match assigned files.'
    );
  }
  return Object.freeze({
    schemaVersion: WORKER_PAYLOAD_SCHEMA_VERSION,
    generation: payload.generation,
    runtimeFiles: Object.freeze(runtimeFiles),
    runtimeManifest,
    runtimeSettingsPath,
    resultPath,
  });
}

function loadWorkerResult({ descriptor, index, total }) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(descriptor.payload.resultPath, 'utf8'));
  } catch (error) {
    throw workerError(
      'METEOR_RSTEST_WORKER_RESULT_MISSING',
      `Worker ${descriptor.id} result is missing or invalid: ${error.message}`
    );
  }
  if (!payload || payload.protocolVersion !== 1 ||
      payload.generation !== descriptor.payload.generation ||
      !payload.worker || payload.worker.id !== descriptor.id ||
      payload.worker.index !== index || payload.worker.total !== total ||
      !validateResult(payload.result)) {
    throw workerError(
      'METEOR_RSTEST_WORKER_RESULT_INVALID',
      `Worker ${descriptor.id} result protocol, generation, identity, or result is invalid.`
    );
  }
  return payload.result;
}

function infrastructureCase(worker, messages) {
  const message = messages.join(' ');
  return {
    name: `Meteor Rstest worker ${worker}`,
    fullName: `Meteor Rstest worker ${worker}`,
    status: 'fail',
    duration: 0,
    worker,
    architecture: 'coordinator',
    error: {
      name: 'Error',
      message,
    },
  };
}

function aggregateRstestWorkerResults({
  descriptors,
  outcome,
  verbose = false,
  colors = !process.env.METEOR_DISABLE_COLORS && !process.env.NO_COLOR,
  log = message => console.log(message),
}) {
  const stats = { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 };
  const cases = [];
  const statuses = new Map();
  let infrastructureFailure = false;
  let signalFailure = false;

  for (const status of outcome && Array.isArray(outcome.workers)
    ? outcome.workers
    : []) {
    if (!status || typeof status.id !== 'string' || statuses.has(status.id)) {
      infrastructureFailure = true;
      continue;
    }
    statuses.set(status.id, status);
  }

  for (const [index, descriptor] of descriptors.entries()) {
    const messages = [];
    const status = statuses.get(descriptor.id);
    let workerResult;
    try {
      workerResult = loadWorkerResult({
        descriptor,
        index,
        total: descriptors.length,
      });
    } catch (error) {
      infrastructureFailure = true;
      messages.push(error.message);
    }

    if (!status) {
      infrastructureFailure = true;
      messages.push(`[Meteor Rstest] Worker ${descriptor.id} has no process status.`);
    } else {
      statuses.delete(descriptor.id);
      if (status.signal) {
        signalFailure = true;
        messages.push(
          `[Meteor Rstest] Worker ${descriptor.id} exited on ${status.signal}.`
        );
      } else if (!Number.isSafeInteger(status.code) ||
          status.code < 0 || status.code > 1) {
        infrastructureFailure = true;
        messages.push(
          `[Meteor Rstest] Worker ${descriptor.id} exited with infrastructure ` +
          `status ${String(status.code)}.`
        );
      } else if (workerResult && status.code !== (workerResult.ok ? 0 : 1)) {
        infrastructureFailure = true;
        messages.push(
          `[Meteor Rstest] Worker ${descriptor.id} exit status conflicts with its result.`
        );
      }
    }

    if (workerResult) {
      for (const field of Object.keys(stats)) {
        stats[field] += workerResult.stats[field];
      }
      for (const testCase of workerResult.cases) {
        cases.push({ ...testCase, worker: descriptor.id });
      }
    }
    if (messages.length > 0) {
      stats.total += 1;
      stats.failed += 1;
      cases.push(infrastructureCase(descriptor.id, messages));
    }
  }

  if (statuses.size > 0) {
    infrastructureFailure = true;
    stats.total += 1;
    stats.failed += 1;
    cases.push(infrastructureCase(
      'coordinator',
      [`[Meteor Rstest] Received unexpected worker status: ${[
        ...statuses.keys(),
      ].join(', ')}.`]
    ));
  }

  const result = {
    ok: stats.failed === 0,
    stats,
    cases,
  };
  log(formatRuntimeReport({
    entries: [{
      architecture: 'workers',
      label: `Meteor runtime · ${descriptors.length} workers`,
      result,
    }],
    verbose,
    colors,
  }));
  return Object.freeze({
    exitCode: signalFailure
      ? 255
      : infrastructureFailure
        ? 254
        : stats.failed > 0
          ? 1
          : 0,
    result,
  });
}

module.exports = {
  WORKER_PAYLOAD_SCHEMA_VERSION,
  aggregateRstestWorkerResults,
  createRstestHostDescriptors,
  partitionRuntimeFiles,
  validateRstestWorkerPayload,
  writePrivateJson,
};
