const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const {
  allocateWorkerPortPairs,
  createMeteorTestHostService,
  normalizeRuntimeWorkers,
  readWorkerContext,
  serializeTestWorkerOptions,
  validateRuntimeWorkerCommand,
  validateHostRequest,
  writeWorkerContext,
} = require('../meteor-hosts.js');

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-test-hosts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('runtime worker count accepts positive integers only', () => {
  assert.equal(normalizeRuntimeWorkers(undefined), 1);
  assert.equal(normalizeRuntimeWorkers(1), 1);
  assert.equal(normalizeRuntimeWorkers(4), 4);
  assert.throws(() => normalizeRuntimeWorkers(0), /positive integer/);
  assert.throws(() => normalizeRuntimeWorkers(1.5), /positive integer/);
  assert.throws(() => normalizeRuntimeWorkers('2'), /positive integer/);
});

test('runtime worker policy protects unsupported Meteor host modes', () => {
  assert.doesNotThrow(() => validateRuntimeWorkerCommand({
    runtimeWorkers: 1,
    command: 'test-packages',
    options: {},
    env: { MONGO_URL: 'mongodb://example/test' },
  }));
  assert.doesNotThrow(() => validateRuntimeWorkerCommand({
    runtimeWorkers: 2,
    command: 'test',
    options: { once: true, 'server-only': true },
    env: {},
  }));
  assert.throws(() => validateRuntimeWorkerCommand({
    runtimeWorkers: 2,
    command: 'test-packages',
    options: { once: true, 'server-only': true },
    env: {},
  }), /meteor test only/);
  assert.throws(() => validateRuntimeWorkerCommand({
    runtimeWorkers: 2,
    command: 'test',
    options: { 'server-only': true },
    env: {},
  }), /--once/);
  assert.throws(() => validateRuntimeWorkerCommand({
    runtimeWorkers: 2,
    command: 'test',
    options: { once: true },
    env: {},
  }), /--server-only/);
  for (const [key, value] of [
    ['full-app', true],
    ['deploy', 'example.com'],
    ['inspect', '9229'],
    ['inspect-brk', '9229'],
    ['ios', true],
    ['android', true],
  ]) {
    assert.throws(() => validateRuntimeWorkerCommand({
      runtimeWorkers: 2,
      command: 'test',
      options: { once: true, 'server-only': true, [key]: value },
      env: {},
    }), /does not support/);
  }
  for (const key of ['ROOT_URL', 'MONGO_URL', 'MONGO_OPLOG_URL', 'UNIX_SOCKET_PATH']) {
    assert.throws(() => validateRuntimeWorkerCommand({
      runtimeWorkers: 2,
      command: 'test',
      options: { once: true, 'server-only': true },
      env: { [key]: 'set' },
    }), new RegExp(key));
  }
});

test('worker option serializer preserves allowlisted command behavior only', () => {
  const result = serializeTestWorkerOptions({
    once: true,
    'server-only': true,
    project: [
      'meteor-pure-server',
      'meteor-runtime-server',
      'meteor-runtime-client',
      'meteor-e2e',
    ],
    'test-file': ['a.test.js'],
    settings: '/app/settings.json',
    args: ['--reporter=dot'],
    appDir: '/private/app',
    port: '3000',
    'runtime-workers': 4,
    __testRunnerWorker: { secret: true },
    unknown: 'drop-me',
  });
  assert.deepEqual(result, {
    once: true,
    'server-only': true,
    project: ['meteor-runtime-server', 'meteor-runtime-client'],
    'test-file': ['a.test.js'],
    settings: '/app/settings.json',
    args: ['--reporter=dot'],
  });
});

test('worker port pairs reserve proxy and Mongo ports deterministically', async () => {
  const checked = [];
  const pairs = await allocateWorkerPortPairs({
    basePort: 4100,
    count: 3,
    isPortAvailable: async port => {
      checked.push(port);
      return true;
    },
  });

  assert.deepEqual(pairs, [
    { proxyPort: 4100, mongoPort: 4101 },
    { proxyPort: 4102, mongoPort: 4103 },
    { proxyPort: 4104, mongoPort: 4105 },
  ]);
  assert.deepEqual(checked, [4100, 4101, 4102, 4103, 4104, 4105]);

  await assert.rejects(
    allocateWorkerPortPairs({
      basePort: 4200,
      count: 2,
      isPortAvailable: async port => port !== 4203,
    }),
    /4203.*not available/
  );
  await assert.rejects(
    allocateWorkerPortPairs({
      basePort: 65534,
      count: 2,
      isPortAvailable: async () => true,
    }),
    /port range/
  );
});

test('host request requires unique stable ids and JSON-safe payloads', () => {
  const hosts = validateHostRequest([
    { id: 'server-1', payload: { files: ['a.js'] } },
    { id: 'server-2', payload: { files: ['b.js'] } },
  ]);
  assert.equal(Object.isFrozen(hosts), true);
  assert.equal(Object.isFrozen(hosts[0].payload), true);
  assert.throws(() => validateHostRequest([]), /at least one host/);
  assert.throws(() => validateHostRequest([
    { id: 'same', payload: {} },
    { id: 'same', payload: {} },
  ]), /unique/);
  assert.throws(() => validateHostRequest([
    { id: 'bad id', payload: {} },
  ]), /stable identifier/);
  assert.throws(() => validateHostRequest([
    { id: 'one', payload: { fn() {} } },
  ]), /JSON-safe/);
});

test('worker context round-trips opaque payload with private permissions', t => {
  const root = tempRoot(t);
  const filename = writeWorkerContext({
    root,
    providerId: 'rstest',
    worker: {
      id: 'server-1',
      index: 0,
      total: 2,
      payload: { files: ['a.js'] },
    },
    commandOptions: { once: true, 'server-only': true, args: [] },
    port: 4100,
    testAppPath: path.join(root, 'host-1'),
  });

  assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
  assert.deepEqual(readWorkerContext(filename), {
    schemaVersion: 1,
    providerId: 'rstest',
    worker: {
      id: 'server-1',
      index: 0,
      total: 2,
      payload: { files: ['a.js'] },
    },
    commandOptions: { once: true, 'server-only': true, args: [] },
    port: 4100,
    testAppPath: path.join(root, 'host-1'),
  });
  assert.throws(() => readWorkerContext('relative.json'), /absolute/);
});

test('Meteor host service preserves stable results and lets test failures finish', async t => {
  const root = tempRoot(t);
  const output = [];
  const stopped = [];
  const prepared = [];
  const completions = new Map();
  const spawnWorker = options => {
    let resolve;
    const completion = new Promise(done => {
      resolve = done;
    });
    completions.set(options.worker.id, { resolve, options });
    options.onStdout(`${options.worker.id} out\npartial`);
    options.onStdout(' line\n');
    options.onStderr(`${options.worker.id} err\n`);
    return {
      completion,
      async stop(signal) {
        stopped.push([options.worker.id, signal]);
      },
    };
  };
  const service = createMeteorTestHostService({
    appDir: root,
    harnessRoot: path.join(root, 'coordinator'),
    basePort: 4300,
    providerId: 'fake',
    commandOptions: { once: true, 'server-only': true, args: [] },
    async prepare() {
      prepared.push('parent');
    },
    async prepareWorker({ worker, projectLocalDir }) {
      prepared.push(`${worker.id}:${projectLocalDir}`);
    },
    spawnWorker,
    isPortAvailable: async () => true,
    write: line => output.push(line),
  });

  const handle = service.start([
    { id: 'one', payload: { value: 1 } },
    { id: 'two', payload: { value: 2 } },
  ]);
  while (completions.size < 2) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(prepared, [
    'parent',
    `one:${path.join(root, 'coordinator', 'workers', 'one', '.meteor', 'local-one')}`,
    `two:${path.join(root, 'coordinator', 'workers', 'two', '.meteor', 'local-two')}`,
  ]);
  assert.equal(
    completions.get('one').options.env.METEOR_LOCAL_DIR,
    path.join(root, 'coordinator', 'workers', 'one', '.meteor', 'local-one')
  );
  assert.equal(
    completions.get('two').options.env.METEOR_LOCAL_DIR,
    path.join(root, 'coordinator', 'workers', 'two', '.meteor', 'local-two')
  );
  completions.get('two').resolve({ code: 1, signal: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped.length, 0);
  completions.get('one').resolve({ code: 0, signal: null });

  const result = await handle.completion;
  assert.deepEqual(result.workers.map(worker => ({
    id: worker.id,
    code: worker.code,
    signal: worker.signal,
  })), [
    { id: 'one', code: 0, signal: null },
    { id: 'two', code: 1, signal: null },
  ]);
  assert.match(result.workers[0].stdout, /one out\npartial line/);
  assert.match(result.workers[1].stderr, /two err/);
  assert.ok(output.some(line => line.includes(
    '[test worker 1/2] proxy=4300 mongo=4301 id=one'
  )));
  assert.ok(output.some(line => line.includes('[test worker 2/2] two out')));
  assert.ok(output.some(line => line.includes('[test worker 1/2] partial line')));
  await handle.stop('SIGTERM');
  assert.equal(stopped.length, 0);
});

test('Meteor host service stops active siblings after spawn failure', async t => {
  const root = tempRoot(t);
  const stopped = [];
  let firstResolve;
  const service = createMeteorTestHostService({
    appDir: root,
    harnessRoot: path.join(root, 'coordinator'),
    basePort: 4400,
    providerId: 'fake',
    commandOptions: { once: true, 'server-only': true, args: [] },
    isPortAvailable: async () => true,
    write() {},
    spawnWorker(options) {
      if (options.worker.id === 'two') throw new Error('spawn failed');
      return {
        completion: new Promise(resolve => {
          firstResolve = resolve;
        }),
        async stop(signal) {
          stopped.push([options.worker.id, signal]);
          firstResolve({ code: null, signal });
        },
      };
    },
  });

  const handle = service.start([
    { id: 'one', payload: {} },
    { id: 'two', payload: {} },
  ]);
  await assert.rejects(handle.completion, /spawn failed/);
  assert.deepEqual(stopped, [['one', 'SIGTERM']]);
});

test('Meteor host service bounds pipe drain after a worker exit', async t => {
  const root = tempRoot(t);
  const processGroups = new Set();
  const stopped = [];
  t.after(() => {
    for (const pid of processGroups) {
      try { process.kill(-pid, 'SIGKILL'); } catch {}
    }
  });
  const service = createMeteorTestHostService({
    appDir: root,
    harnessRoot: path.join(root, 'coordinator'),
    basePort: 4500,
    providerId: 'fake',
    commandOptions: { once: true, 'server-only': true, args: [] },
    workerDrainTimeoutMs: 25,
    workerExecutionTimeoutMs: 2000,
    workerStopTimeoutMs: 100,
    isPortAvailable: async () => true,
    write() {},
    spawnWorker(options) {
      const child = spawn(process.execPath, ['-e', String.raw`
        const { spawn } = require('node:child_process');
        const descendant = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {
          stdio: ['ignore', 'inherit', 'inherit'],
        });
        descendant.unref();
      `], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      processGroups.add(child.pid);
      child.stdout.on('data', options.onStdout);
      child.stderr.on('data', options.onStderr);
      const started = new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      const exited = new Promise((resolve, reject) => {
        child.once('exit', (code, signal) => resolve({ code, signal }));
        child.once('error', reject);
      });
      const completion = new Promise((resolve, reject) => {
        child.once('close', (code, signal) => resolve({ code, signal }));
        child.once('error', reject);
      });
      return {
        started,
        exited,
        completion,
        async stop(signal) {
          stopped.push([options.worker.id, signal]);
          try { process.kill(-child.pid, signal); } catch {}
          return completion;
        },
      };
    },
  });

  const handle = service.start([{ id: 'one', payload: {} }]);
  const result = await Promise.race([
    handle.completion,
    new Promise(resolve => setTimeout(() => resolve('test-timeout'), 1000)),
  ]);

  assert.notEqual(result, 'test-timeout');
  assert.equal(result.workers[0].code, null);
  assert.equal(result.workers[0].signal, null);
  assert.equal(
    result.workers[0].error.code,
    'METEOR_TEST_WORKER_DRAIN_TIMEOUT'
  );
  assert.match(result.workers[0].error.message, /one.*pipe drain/i);
  assert.deepEqual(stopped, [['one', 'SIGTERM']]);
});

test('Meteor host service bounds execution and stops every active worker', async t => {
  const root = tempRoot(t);
  const stopped = [];
  const service = createMeteorTestHostService({
    appDir: root,
    harnessRoot: path.join(root, 'coordinator'),
    basePort: 4600,
    providerId: 'fake',
    commandOptions: { once: true, 'server-only': true, args: [] },
    workerExecutionTimeoutMs: 25,
    workerStopTimeoutMs: 25,
    isPortAvailable: async () => true,
    write() {},
    spawnWorker(options) {
      return {
        started: Promise.resolve(),
        exited: new Promise(() => {}),
        completion: new Promise(() => {}),
        stop(signal) {
          stopped.push([options.worker.id, signal]);
          return new Promise(() => {});
        },
      };
    },
  });

  const handle = service.start([
    { id: 'one', payload: {} },
    { id: 'two', payload: {} },
  ]);
  const result = await Promise.race([
    handle.completion,
    new Promise(resolve => setTimeout(() => resolve('test-timeout'), 1000)),
  ]);

  assert.notEqual(result, 'test-timeout');
  assert.deepEqual(
    result.workers.map(worker => worker.error.code),
    [
      'METEOR_TEST_WORKER_EXECUTION_TIMEOUT',
      'METEOR_TEST_WORKER_EXECUTION_TIMEOUT',
    ]
  );
  assert.deepEqual(stopped.sort(), [
    ['one', 'SIGKILL'],
    ['one', 'SIGTERM'],
    ['two', 'SIGKILL'],
    ['two', 'SIGTERM'],
  ]);
});

test('Meteor host service bounds worker process startup', async t => {
  const root = tempRoot(t);
  const stopped = [];
  const service = createMeteorTestHostService({
    appDir: root,
    harnessRoot: path.join(root, 'coordinator'),
    basePort: 4700,
    providerId: 'fake',
    commandOptions: { once: true, 'server-only': true, args: [] },
    workerStartupTimeoutMs: 25,
    workerExecutionTimeoutMs: 2000,
    workerStopTimeoutMs: 25,
    isPortAvailable: async () => true,
    write() {},
    spawnWorker(options) {
      return {
        started: new Promise(() => {}),
        exited: Promise.resolve({ code: 0, signal: null }),
        completion: Promise.resolve({ code: 0, signal: null }),
        async stop(signal) {
          stopped.push([options.worker.id, signal]);
        },
      };
    },
  });

  const result = await service.start([
    { id: 'one', payload: {} },
  ]).completion;

  assert.equal(
    result.workers[0].error.code,
    'METEOR_TEST_WORKER_STARTUP_TIMEOUT'
  );
  assert.deepEqual(stopped, [['one', 'SIGTERM']]);
});

test('Meteor host service bounds coordinator preparation before spawning', async t => {
  const root = tempRoot(t);
  let spawned = false;
  const service = createMeteorTestHostService({
    appDir: root,
    harnessRoot: path.join(root, 'coordinator'),
    basePort: 4800,
    providerId: 'fake',
    commandOptions: { once: true, 'server-only': true, args: [] },
    workerPreparationTimeoutMs: 25,
    prepare: () => new Promise(() => {}),
    isPortAvailable: async () => true,
    write() {},
    spawnWorker() {
      spawned = true;
      throw new Error('must not spawn');
    },
  });

  const result = await Promise.race([
    service.start([{ id: 'one', payload: {} }]).completion.then(
      () => 'resolved',
      error => error
    ),
    new Promise(resolve => setTimeout(() => resolve('test-timeout'), 1000)),
  ]);

  assert.notEqual(result, 'test-timeout');
  assert.equal(result.code, 'METEOR_TEST_WORKER_PREPARATION_TIMEOUT');
  assert.match(result.message, /preparation exceeded 25ms/i);
  assert.equal(spawned, false);
});
