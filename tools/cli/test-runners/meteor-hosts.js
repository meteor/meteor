const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  cloneJsonSafe,
} = require('../../tool-env/test-runner-context.js');

const WORKER_CONTEXT_SCHEMA_VERSION = 1;
const HOST_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const WORKER_STARTUP_TIMEOUT_MS = 30_000;
const WORKER_PREPARATION_TIMEOUT_MS = 5 * 60_000;
const WORKER_EXECUTION_TIMEOUT_MS = 10 * 60_000;
const WORKER_DRAIN_TIMEOUT_MS = 2_000;
const WORKER_STOP_TIMEOUT_MS = 5_000;
const TEST_WORKER_OPTION_KEYS = Object.freeze([
  'once',
  'production',
  'settings',
  'headless',
  'verbose',
  'raw-logs',
  'timestamps',
  'no-release-check',
  'disable-oplog',
  'test-runner',
  'config',
  'project',
  'test-file',
  'test-name-pattern',
  'browser',
  'coverage',
  'update-snapshots',
  'shard',
  'changed',
  'changed-since',
  'server-only',
  'client-only',
  'allow-incompatible-update',
  'no-lint',
  'extra-packages',
  'exclude-archs',
  'filter',
  'full-app',
  'args',
]);

function normalizeRuntimeWorkers(value) {
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('--runtime-workers must be a positive integer.');
  }
  return value;
}

function validateRuntimeWorkerCommand({
  runtimeWorkers,
  command,
  options = {},
  env = process.env,
}) {
  if (runtimeWorkers <= 1) return;
  if (command !== 'test') {
    throw new Error('--runtime-workers currently supports meteor test only.');
  }
  if (!options.once) {
    throw new Error('--runtime-workers requires --once.');
  }
  if (!options['server-only'] || options['client-only']) {
    throw new Error('--runtime-workers currently requires --server-only.');
  }
  const unsupportedOptions = [
    'full-app',
    'deploy',
    'inspect',
    'inspect-brk',
    'debug-port',
    'ios',
    'ios-device',
    'android',
    'android-device',
    'mobile-server',
    'cordova-server-port',
  ].filter(key => options[key]);
  if (unsupportedOptions.length > 0) {
    throw new Error(
      `--runtime-workers does not support ${unsupportedOptions.map(
        key => `--${key}`
      ).join(', ')}.`
    );
  }
  for (const key of [
    'ROOT_URL',
    'MONGO_URL',
    'MONGO_OPLOG_URL',
    'UNIX_SOCKET_PATH',
  ]) {
    if (env[key]) {
      throw new Error(`--runtime-workers does not support ${key}.`);
    }
  }
}

function serializeTestWorkerOptions(options) {
  const serialized = {};
  for (const key of TEST_WORKER_OPTION_KEYS) {
    if (options[key] !== undefined) serialized[key] = options[key];
  }
  return cloneJsonSafe(serialized, 'worker.commandOptions');
}

function validateHostRequest(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('Meteor host service requires at least one host.');
  }
  const ids = new Set();
  return Object.freeze(input.map((host, index) => {
    if (!host || typeof host !== 'object' || Array.isArray(host)) {
      throw new Error(`hosts[${index}] must be an object.`);
    }
    if (typeof host.id !== 'string' || !HOST_ID_PATTERN.test(host.id)) {
      throw new Error(`hosts[${index}].id must be a stable identifier.`);
    }
    if (ids.has(host.id)) {
      throw new Error('Meteor host ids must be unique.');
    }
    ids.add(host.id);
    return Object.freeze({
      id: host.id,
      payload: cloneJsonSafe(host.payload || {}, `hosts[${index}].payload`),
    });
  }));
}

function defaultIsPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function allocateWorkerPortPairs({
  basePort,
  count,
  isPortAvailable = defaultIsPortAvailable,
}) {
  if (!Number.isSafeInteger(basePort) || basePort < 1) {
    throw new Error('Meteor worker base port must be a positive integer.');
  }
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Meteor worker count must be a positive integer.');
  }
  const lastPort = basePort + count * 2 - 1;
  if (lastPort > 65535) {
    throw new Error(
      `Meteor worker port range ${basePort}-${lastPort} exceeds 65535.`
    );
  }

  const pairs = [];
  for (let index = 0; index < count; index += 1) {
    const proxyPort = basePort + index * 2;
    const mongoPort = proxyPort + 1;
    for (const port of [proxyPort, mongoPort]) {
      if (!await isPortAvailable(port)) {
        throw new Error(`Meteor worker port ${port} is not available.`);
      }
    }
    pairs.push({ proxyPort, mongoPort });
  }
  return pairs;
}

function validateWorkerIdentity(worker) {
  if (!worker || typeof worker !== 'object' || Array.isArray(worker)) {
    throw new Error('Meteor worker identity must be an object.');
  }
  if (typeof worker.id !== 'string' || !HOST_ID_PATTERN.test(worker.id)) {
    throw new Error('Meteor worker id must be a stable identifier.');
  }
  if (!Number.isSafeInteger(worker.index) || worker.index < 0 ||
      !Number.isSafeInteger(worker.total) || worker.total < 1 ||
      worker.index >= worker.total) {
    throw new Error('Meteor worker index and total are invalid.');
  }
  return Object.freeze({
    id: worker.id,
    index: worker.index,
    total: worker.total,
    payload: cloneJsonSafe(worker.payload || {}, 'worker.payload'),
  });
}

function validateWorkerContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      context.schemaVersion !== WORKER_CONTEXT_SCHEMA_VERSION) {
    throw new Error('Invalid Meteor test worker context schema.');
  }
  if (typeof context.providerId !== 'string' ||
      !HOST_ID_PATTERN.test(context.providerId)) {
    throw new Error('Meteor test worker provider id is invalid.');
  }
  if (!Number.isSafeInteger(context.port) || context.port < 1 ||
      context.port > 65535) {
    throw new Error('Meteor test worker port is invalid.');
  }
  if (typeof context.testAppPath !== 'string' ||
      !path.isAbsolute(context.testAppPath)) {
    throw new Error('Meteor test worker app path must be absolute.');
  }
  return Object.freeze({
    schemaVersion: WORKER_CONTEXT_SCHEMA_VERSION,
    providerId: context.providerId,
    worker: validateWorkerIdentity(context.worker),
    commandOptions: cloneJsonSafe(
      context.commandOptions || {},
      'worker.commandOptions'
    ),
    port: context.port,
    testAppPath: context.testAppPath,
  });
}

function writeWorkerContext({
  root,
  providerId,
  worker,
  commandOptions,
  port,
  testAppPath,
}) {
  if (!path.isAbsolute(root)) {
    throw new Error('Meteor test worker context root must be absolute.');
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const context = validateWorkerContext({
    schemaVersion: WORKER_CONTEXT_SCHEMA_VERSION,
    providerId,
    worker,
    commandOptions,
    port,
    testAppPath,
  });
  const filename = path.join(root, `${worker.index + 1}-${worker.id}.json`);
  fs.writeFileSync(filename, `${JSON.stringify(context)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.chmodSync(filename, 0o600);
  return filename;
}

function readWorkerContext(filename) {
  if (!path.isAbsolute(filename)) {
    throw new Error('Meteor test worker context path must be absolute.');
  }
  return validateWorkerContext(JSON.parse(fs.readFileSync(filename, 'utf8')));
}

function createLineWriter({ worker, channel, write, capture }) {
  let pending = '';
  const prefix = `[test worker ${worker.index + 1}/${worker.total}] `;
  return {
    push(chunk) {
      const text = String(chunk);
      capture.push(text);
      pending += text;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        write(`${prefix}${pending.slice(0, newline)}\n`, channel);
        pending = pending.slice(newline + 1);
      }
    },
    flush() {
      if (pending) write(`${prefix}${pending}\n`, channel);
      pending = '';
    },
  };
}

function waitForWorkerStage(promise, timeoutMs) {
  let timeoutId;
  return Promise.race([
    Promise.resolve(promise).then(
      value => ({ state: 'resolved', value }),
      error => ({ state: 'rejected', error })
    ),
    new Promise(resolve => {
      timeoutId = setTimeout(() => resolve({ state: 'timeout' }), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

function workerLifecycleError(worker, phase, timeoutMs, cause) {
  const phaseLabel = phase === 'drain' ? 'pipe drain' : phase;
  const code = `METEOR_TEST_WORKER_${phase.toUpperCase()}_${
    cause ? 'FAILED' : 'TIMEOUT'
  }`;
  const detail = cause && cause.message ? `: ${cause.message}` : '';
  return Object.freeze({
    code,
    message: cause
      ? `Meteor test worker ${worker.id} ${phaseLabel} failed${detail}`
      : `Meteor test worker ${worker.id} ${phaseLabel} exceeded ${timeoutMs}ms.`,
  });
}

function workerLifecycleException(worker, phase, timeoutMs, cause) {
  const detail = workerLifecycleError(worker, phase, timeoutMs, cause);
  const error = new Error(detail.message);
  error.code = detail.code;
  return error;
}

function spawnMeteorWorker({
  appDir,
  contextFile,
  worker,
  onStdout,
  onStderr,
  env = process.env,
  stopTimeoutMs = WORKER_STOP_TIMEOUT_MS,
}) {
  const files = require('../../fs/files');
  const meteorScript = process.platform === 'win32' ? 'meteor.bat' : 'meteor';
  const meteorPath = files.pathJoin(files.getCurrentToolsDir(), meteorScript);
  const ownsProcessGroup = process.platform !== 'win32';
  const child = spawn(
    files.convertToOSPath(meteorPath),
    ['test-runner-worker', files.convertToOSPath(contextFile)],
    {
      cwd: files.convertToOSPath(appDir),
      env: {
        ...env,
        METEOR_TEST_WORKER_ID: worker.id,
        METEOR_TEST_WORKER_TOTAL: String(worker.total),
      },
      detached: ownsProcessGroup,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', onStdout);
  child.stderr.on('data', onStderr);

  let closed = false;
  let stopped = false;
  const processError = new Promise((resolve, reject) => {
    child.once('error', reject);
  });
  const started = Promise.race([
    new Promise(resolve => child.once('spawn', resolve)),
    processError,
  ]);
  const exited = Promise.race([
    new Promise(resolve => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    }),
    processError,
  ]);
  const completion = Promise.race([new Promise(resolve => {
    child.once('close', (code, signal) => {
      closed = true;
      resolve({ code, signal });
    });
  }), processError]);
  const terminate = signal => {
    if (closed) return;
    if (process.platform === 'win32' && child.pid) {
      const args = ['/pid', String(child.pid), '/t'];
      if (signal === 'SIGKILL') args.push('/f');
      spawn('taskkill', args, { stdio: 'ignore' }).once('error', () => {
        try { child.kill(signal); } catch {}
      });
      return;
    }
    if (ownsProcessGroup && child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {}
    }
    try { child.kill(signal); } catch {}
  };

  return {
    started,
    exited,
    completion,
    async stop(signal = 'SIGTERM') {
      if (closed) return completion;
      if (stopped) return completion;
      stopped = true;
      terminate(signal);
      const stoppedGracefully = await waitForWorkerStage(
        completion,
        stopTimeoutMs
      );
      if (stoppedGracefully.state === 'resolved') {
        return stoppedGracefully.value;
      }
      if (stoppedGracefully.state === 'rejected') return undefined;
      if (stoppedGracefully.state === 'timeout' && !closed) {
        terminate('SIGKILL');
        const forced = await waitForWorkerStage(completion, stopTimeoutMs);
        return forced.state === 'resolved' ? forced.value : undefined;
      }
      return undefined;
    },
  };
}

function createMeteorTestHostService({
  appDir,
  harnessRoot,
  basePort,
  providerId,
  commandOptions,
  env = process.env,
  prepare = async () => {},
  prepareWorker = async () => {},
  spawnWorker = spawnMeteorWorker,
  isPortAvailable = defaultIsPortAvailable,
  workerPreparationTimeoutMs = WORKER_PREPARATION_TIMEOUT_MS,
  workerStartupTimeoutMs = WORKER_STARTUP_TIMEOUT_MS,
  workerExecutionTimeoutMs = WORKER_EXECUTION_TIMEOUT_MS,
  workerDrainTimeoutMs = WORKER_DRAIN_TIMEOUT_MS,
  workerStopTimeoutMs = WORKER_STOP_TIMEOUT_MS,
  write = (line, channel) => {
    (channel === 'stderr' ? process.stderr : process.stdout).write(line);
  },
}) {
  let currentHandle = null;
  return Object.freeze({
    start(hostInput, { basePort: requestedBasePort = basePort } = {}) {
      if (currentHandle) {
        throw new Error('Meteor test host service is already running.');
      }
      const hosts = validateHostRequest(hostInput);
      const active = new Map();
      let finished = false;
      let stopping = null;
      const stopAll = async (signal = 'SIGTERM') => {
        if (stopping) return stopping;
        stopping = Promise.all([...active.values()].map(async entry => {
          const stop = Promise.resolve()
            .then(() => entry.handle.stop(signal))
            .catch(() => undefined);
          const result = await waitForWorkerStage(stop, workerStopTimeoutMs);
          if (result.state === 'timeout' && signal !== 'SIGKILL') {
            Promise.resolve()
              .then(() => entry.handle.stop('SIGKILL'))
              .catch(() => undefined);
          }
        })).finally(() => {
          stopping = null;
        });
        return stopping;
      };
      const monitorWorker = async ({ worker, handle }) => {
        const fail = async (phase, timeoutMs, cause) => {
          const error = workerLifecycleError(worker, phase, timeoutMs, cause);
          await stopAll('SIGTERM');
          return { code: null, signal: null, error };
        };

        if (handle.started) {
          const startup = await waitForWorkerStage(
            handle.started,
            workerStartupTimeoutMs
          );
          if (startup.state === 'timeout') {
            return fail('startup', workerStartupTimeoutMs);
          }
          if (startup.state === 'rejected') {
            return fail('startup', workerStartupTimeoutMs, startup.error);
          }
        }

        const hasExitStage = Boolean(handle.exited);
        const execution = await waitForWorkerStage(
          hasExitStage ? handle.exited : handle.completion,
          workerExecutionTimeoutMs
        );
        if (execution.state === 'timeout') {
          return fail('execution', workerExecutionTimeoutMs);
        }
        if (execution.state === 'rejected') {
          return fail('execution', workerExecutionTimeoutMs, execution.error);
        }
        if (!hasExitStage) return execution.value;

        const drain = await waitForWorkerStage(
          handle.completion,
          workerDrainTimeoutMs
        );
        if (drain.state === 'timeout') {
          return fail('drain', workerDrainTimeoutMs);
        }
        if (drain.state === 'rejected') {
          return fail('drain', workerDrainTimeoutMs, drain.error);
        }
        return drain.value;
      };
      const preparationDeadline = Date.now() + workerPreparationTimeoutMs;
      const waitForPreparation = async operation => {
        const remaining = Math.max(0, preparationDeadline - Date.now());
        const result = await waitForWorkerStage(operation, remaining);
        if (result.state === 'timeout') {
          throw workerLifecycleException(
            { id: 'coordinator' },
            'preparation',
            workerPreparationTimeoutMs
          );
        }
        if (result.state === 'rejected') throw result.error;
        return result.value;
      };
      const completion = (async () => {
        await waitForPreparation(Promise.resolve().then(() => prepare()));
        const pairs = await waitForPreparation(allocateWorkerPortPairs({
          basePort: requestedBasePort,
          count: hosts.length,
          isPortAvailable,
        }));
        const contextRoot = path.join(
          harnessRoot,
          '.meteor',
          'local',
          'test-workers'
        );
        const tasks = [];
        try {
          for (const [index, host] of hosts.entries()) {
            const worker = Object.freeze({
              id: host.id,
              index,
              total: hosts.length,
              payload: host.payload,
            });
            const pair = pairs[index];
            const testAppPath = path.join(harnessRoot, 'workers', host.id);
            const projectLocalDir = path.join(
              testAppPath,
              '.meteor',
              `local-${host.id}`
            );
            await waitForPreparation(Promise.resolve().then(() => prepareWorker({
              worker,
              testAppPath,
              projectLocalDir,
            })));
            const contextFile = writeWorkerContext({
              root: contextRoot,
              providerId,
              worker,
              commandOptions,
              port: pair.proxyPort,
              testAppPath,
            });
            write(
              `[test worker ${index + 1}/${hosts.length}] ` +
              `proxy=${pair.proxyPort} mongo=${pair.mongoPort} id=${host.id}\n`,
              'stdout'
            );
            const stdout = [];
            const stderr = [];
            const stdoutWriter = createLineWriter({
              worker,
              channel: 'stdout',
              write,
              capture: stdout,
            });
            const stderrWriter = createLineWriter({
              worker,
              channel: 'stderr',
              write,
              capture: stderr,
            });
            const processHandle = spawnWorker({
              appDir,
              contextFile,
              worker,
              proxyPort: pair.proxyPort,
              mongoPort: pair.mongoPort,
              stopTimeoutMs: workerStopTimeoutMs,
              env: {
                ...env,
                METEOR_LOCAL_DIR: projectLocalDir,
              },
              onStdout: chunk => stdoutWriter.push(chunk),
              onStderr: chunk => stderrWriter.push(chunk),
            });
            if (!processHandle || !processHandle.completion ||
                typeof processHandle.stop !== 'function') {
              throw new Error(`Meteor worker ${host.id} returned invalid process handle.`);
            }
            active.set(host.id, { handle: processHandle });
            tasks.push(monitorWorker({
              worker,
              handle: processHandle,
            }).then(status => ({
                id: host.id,
                index,
                total: hosts.length,
                code: status && status.code === null
                  ? null
                  : Number(status && status.code),
                signal: status && status.signal || null,
                stdout: stdout.join(''),
                stderr: stderr.join(''),
                ...(status && status.error && { error: status.error }),
              })).finally(() => {
                stdoutWriter.flush();
                stderrWriter.flush();
                active.delete(host.id);
              }));
          }
          const workers = await Promise.all(tasks);
          workers.sort((left, right) => left.index - right.index);
          return Object.freeze({ workers: Object.freeze(workers) });
        } catch (error) {
          await stopAll('SIGTERM');
          throw error;
        }
      })().finally(() => {
        finished = true;
        currentHandle = null;
      });
      const handle = Object.freeze({
        completion,
        async stop(signal = 'SIGTERM') {
          if (!finished) await stopAll(signal);
          return completion.catch(() => {});
        },
      });
      currentHandle = handle;
      return handle;
    },
    async stop(signal = 'SIGTERM') {
      if (currentHandle) await currentHandle.stop(signal);
    },
  });
}

module.exports = {
  TEST_WORKER_OPTION_KEYS,
  WORKER_CONTEXT_SCHEMA_VERSION,
  allocateWorkerPortPairs,
  createMeteorTestHostService,
  normalizeRuntimeWorkers,
  readWorkerContext,
  serializeTestWorkerOptions,
  spawnMeteorWorker,
  validateHostRequest,
  validateRuntimeWorkerCommand,
  writeWorkerContext,
};
