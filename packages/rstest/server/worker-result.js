const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { validateResult } = require('../runtime/coordinator.js');

const GENERATION_PATTERN = /^[a-f0-9]{32,128}$/i;
const WORKER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

function resultError(message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = 'METEOR_RSTEST_WORKER_RESULT';
  return error;
}

function validateWorker(worker) {
  if (!worker || typeof worker !== 'object' || Array.isArray(worker) ||
      typeof worker.id !== 'string' || !WORKER_ID_PATTERN.test(worker.id) ||
      !Number.isSafeInteger(worker.index) || worker.index < 0 ||
      !Number.isSafeInteger(worker.total) || worker.total < 1 ||
      worker.index >= worker.total) {
    throw resultError('Worker result identity is invalid.');
  }
  if (typeof worker.generation !== 'string' ||
      !GENERATION_PATTERN.test(worker.generation)) {
    throw resultError('Worker result generation is invalid.');
  }
  if (typeof worker.resultPath !== 'string' ||
      !path.isAbsolute(worker.resultPath)) {
    throw resultError('Worker result path must be absolute.');
  }
  if (path.basename(worker.resultPath) !== `${worker.id}-result.json`) {
    throw resultError('Worker result path does not match worker identity.');
  }
}

function writeWorkerResult({ worker, result }) {
  validateWorker(worker);
  if (!validateResult(result)) {
    throw resultError('Worker result payload is invalid.');
  }
  if (fs.existsSync(worker.resultPath)) {
    throw resultError(`Worker result already exists: ${worker.resultPath}`);
  }

  const payload = {
    protocolVersion: 1,
    generation: worker.generation,
    worker: {
      id: worker.id,
      index: worker.index,
      total: worker.total,
    },
    result,
  };
  const directory = path.dirname(worker.resultPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    directory,
    `.${path.basename(worker.resultPath)}.${process.pid}.` +
      `${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(payload)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (fs.existsSync(worker.resultPath)) {
      throw resultError(`Worker result already exists: ${worker.resultPath}`);
    }
    fs.renameSync(temporary, worker.resultPath);
    fs.chmodSync(worker.resultPath, 0o600);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
  return payload;
}

module.exports = { writeWorkerResult };
