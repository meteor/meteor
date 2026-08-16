const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  aggregateRstestWorkerResults,
  createRstestHostDescriptors,
  partitionRuntimeFiles,
  validateRstestWorkerPayload,
} = require('../provider/workers.js');
const { writeWorkerResult } = require('../../server/worker-result.js');

function createApp(t) {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-workers-'));
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }));
  return appDir;
}

function writeFile(appDir, relative) {
  const filename = path.join(appDir, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, '');
  return filename;
}

function result({ passed = 0, failed = 0, name = 'case', testPath } = {}) {
  return {
    ok: failed === 0,
    stats: {
      total: passed + failed,
      passed,
      failed,
      skipped: 0,
      todo: 0,
    },
    cases: [
      ...Array.from({ length: passed }, (_, index) => ({
        name: `${name} pass ${index + 1}`,
        fullName: `${name} pass ${index + 1}`,
        status: 'pass',
        duration: 1,
        ...(testPath ? { testPath } : {}),
      })),
      ...Array.from({ length: failed }, (_, index) => ({
        name: `${name} fail ${index + 1}`,
        fullName: `${name} fail ${index + 1}`,
        status: 'fail',
        duration: 1,
        ...(testPath ? { testPath } : {}),
        error: { name: 'AssertionError', message: 'expected true' },
      })),
    ],
  };
}

function resultFixture(t) {
  const appDir = createApp(t);
  const files = [
    writeFile(appDir, 'tests/rstest/runtime/server/a.test.js'),
    writeFile(appDir, 'tests/rstest/runtime/server/b.test.js'),
  ];
  const localDir = path.join(appDir, '.meteor', 'local');
  const generation = '1234567890abcdef1234567890abcdef';
  const plan = createRstestHostDescriptors({
    appDir,
    localDir,
    files,
    requestedWorkers: 2,
    generation,
    runtimeSettingsPath: path.join(
      localDir,
      'rstest',
      'app-runtime-settings.json'
    ),
  });
  const statuses = plan.descriptors.map((descriptor, index) => ({
    id: descriptor.id,
    index,
    total: plan.actualWorkers,
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
  }));
  const write = (index, workerResult) => writeWorkerResult({
    worker: {
      id: plan.descriptors[index].id,
      index,
      total: plan.actualWorkers,
      generation,
      resultPath: plan.descriptors[index].payload.resultPath,
    },
    result: workerResult,
  });
  return { plan, statuses, write };
}

test('runtime files partition deterministically and cap to non-empty hosts', t => {
  const appDir = createApp(t);
  const files = [
    writeFile(appDir, 'tests/rstest/runtime/server/c.test.js'),
    writeFile(appDir, 'tests/rstest/runtime/server/a.test.js'),
    writeFile(appDir, 'tests/rstest/runtime/server/b.test.js'),
  ];

  assert.deepEqual(partitionRuntimeFiles({
    appDir,
    files,
    requestedWorkers: 2,
  }), [
    [fs.realpathSync(files[1]), fs.realpathSync(files[0])],
    [fs.realpathSync(files[2])],
  ]);
  assert.equal(partitionRuntimeFiles({
    appDir,
    files,
    requestedWorkers: 8,
  }).length, 3);
});

test('runtime partition accepts classified colocated files and rejects outside app', t => {
  const appDir = createApp(t);
  const serverFile = writeFile(
    appDir,
    'tests/rstest/runtime/server/server.test.js'
  );
  const colocatedFile = writeFile(
    appDir,
    'imports/items.server.meteor.rstest.test.js',
  );
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-outside-'));
  t.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  const outsideFile = writeFile(outsideRoot, 'outside.test.js');

  assert.throws(() => partitionRuntimeFiles({
    appDir,
    files: [],
    requestedWorkers: 2,
  }), /at least one runtime-server file/);
  assert.throws(() => partitionRuntimeFiles({
    appDir,
    files: [serverFile, serverFile],
    requestedWorkers: 2,
  }), /unique/);
  assert.throws(() => partitionRuntimeFiles({
    appDir,
    files: [outsideFile],
    requestedWorkers: 2,
  }), /app root/);
  assert.deepEqual(partitionRuntimeFiles({
    appDir,
    files: [serverFile, colocatedFile],
    requestedWorkers: 2,
  }).flat().sort(), [serverFile, colocatedFile].map(file =>
    fs.realpathSync(file)
  ).sort());
});

test('host descriptors write private manifests and stable result paths', t => {
  const appDir = createApp(t);
  const files = [
    writeFile(appDir, 'tests/rstest/runtime/server/b.test.js'),
    writeFile(appDir, 'tests/rstest/runtime/server/a.test.js'),
  ];
  const localDir = path.join(appDir, '.meteor', 'local');
  const runtimeSettingsPath = path.join(
    localDir,
    'rstest',
    'app-runtime-settings.json'
  );
  const plan = createRstestHostDescriptors({
    appDir,
    localDir,
    files,
    requestedWorkers: 4,
    generation: '1234567890abcdef1234567890abcdef',
    runtimeSettingsPath,
  });

  assert.equal(plan.requestedWorkers, 4);
  assert.equal(plan.actualWorkers, 2);
  assert.deepEqual(plan.descriptors.map(host => host.id), ['server-1', 'server-2']);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(plan.descriptors[0].payload.runtimeManifest)),
    {
      schemaVersion: 2,
      serverFiles: [fs.realpathSync(files[1])],
      clientFiles: [],
    }
  );
  if (process.platform !== 'win32') {
    assert.equal(
      fs.statSync(plan.descriptors[0].payload.runtimeManifest).mode & 0o777,
      0o600
    );
  }
  assert.equal(
    path.basename(plan.descriptors[0].payload.resultPath),
    'server-1-result.json'
  );
  assert.equal(fs.existsSync(plan.descriptors[0].payload.resultPath), false);
  assert.equal('coveragePath' in plan.descriptors[0].payload, false);
});

test('coverage-enabled host descriptors bind each worker to one artifact', t => {
  const appDir = createApp(t);
  const files = [
    writeFile(appDir, 'tests/rstest/runtime/server/b.test.js'),
    writeFile(appDir, 'tests/rstest/runtime/server/a.test.js'),
  ];
  const localDir = path.join(appDir, '.meteor', 'local');
  const coverageGeneration = 'abcdef1234567890abcdef1234567890';
  const coverageRoot = path.join(
    localDir,
    'rstest',
    'coverage',
    coverageGeneration,
  );
  const plan = createRstestHostDescriptors({
    appDir,
    localDir,
    files,
    requestedWorkers: 2,
    generation: '1234567890abcdef1234567890abcdef',
    runtimeSettingsPath: path.join(
      localDir,
      'rstest',
      'app-runtime-settings.json',
    ),
    coverageRoot,
  });
  fs.writeFileSync(
    path.join(localDir, 'rstest', 'app-runtime-settings.json'),
    JSON.stringify({
      schemaVersion: 1,
      generation: '1234567890abcdef1234567890abcdef',
      coverage: {
        schemaVersion: 1,
        enabled: true,
        provider: 'istanbul',
        generation: coverageGeneration,
        artifactRoot: coverageRoot,
      },
    }),
  );

  assert.deepEqual(plan.descriptors.map(descriptor =>
    path.relative(coverageRoot, descriptor.payload.coveragePath)
  ), ['worker-server-1.json', 'worker-server-2.json']);
  assert.equal(fs.existsSync(plan.descriptors[0].payload.coveragePath), false);

  const worker = {
    id: plan.descriptors[0].id,
    index: 0,
    total: 2,
    payload: plan.descriptors[0].payload,
  };
  assert.equal(
    validateRstestWorkerPayload({ appDir, worker }).coverageGeneration,
    coverageGeneration,
  );
  assert.throws(() => validateRstestWorkerPayload({
    appDir,
    worker: {
      ...worker,
      payload: {
        ...worker.payload,
        coveragePath: path.join(coverageRoot, 'server-1.json'),
      },
    },
  }), /coverage path/);
  assert.throws(() => validateRstestWorkerPayload({
    appDir,
    worker: {
      ...worker,
      payload: {
        ...worker.payload,
        coveragePath: path.join(
          localDir,
          'rstest',
          'coverage',
          '1234567890abcdef1234567890abcdef',
          'worker-server-1.json',
        ),
      },
    },
  }), /coverage path/);
});

test('worker payload validates generation, identity paths, and manifest contents', t => {
  const appDir = createApp(t);
  const file = writeFile(
    appDir,
    'tests/rstest/runtime/server/a.test.js'
  );
  const localDir = path.join(appDir, '.meteor', 'local');
  const generation = '1234567890abcdef1234567890abcdef';
  const descriptor = createRstestHostDescriptors({
    appDir,
    localDir,
    files: [file],
    requestedWorkers: 1,
    generation,
    runtimeSettingsPath: path.join(
      localDir,
      'rstest',
      'app-runtime-settings.json'
    ),
  }).descriptors[0];
  const worker = {
    id: descriptor.id,
    index: 0,
    total: 1,
    payload: descriptor.payload,
  };

  assert.deepEqual(
    validateRstestWorkerPayload({ appDir, worker }).runtimeFiles,
    [fs.realpathSync(file)]
  );
  assert.throws(() => validateRstestWorkerPayload({
    appDir,
    worker: { ...worker, payload: { ...worker.payload, schemaVersion: 2 } },
  }), /schema/);
  assert.throws(() => validateRstestWorkerPayload({
    appDir,
    worker: { ...worker, payload: { ...worker.payload, generation: '../bad' } },
  }), /generation/);
  assert.throws(() => validateRstestWorkerPayload({
    appDir,
    worker: {
      ...worker,
      payload: { ...worker.payload, resultPath: path.join(localDir, 'wrong.json') },
    },
  }), /result path/);

  fs.writeFileSync(worker.payload.runtimeManifest, '[]');
  assert.throws(() => validateRstestWorkerPayload({ appDir, worker }), /manifest/);
});

test('worker aggregation preserves stable cases and assertion failure exit', t => {
  const fixture = resultFixture(t);
  fixture.write(0, result({
    passed: 1,
    name: 'alpha',
    testPath: 'tests/rstest/runtime/server/a.test.js',
  }));
  fixture.write(1, result({
    failed: 1,
    name: 'beta',
    testPath: 'tests/rstest/runtime/server/b.test.js',
  }));
  fixture.statuses[1].code = 1;
  const logs = [];

  const aggregate = aggregateRstestWorkerResults({
    descriptors: fixture.plan.descriptors,
    outcome: { workers: [...fixture.statuses].reverse() },
    colors: false,
    log: line => logs.push(line),
  });

  assert.equal(aggregate.exitCode, 1);
  assert.deepEqual(aggregate.result.stats, {
    total: 2,
    passed: 1,
    failed: 1,
    skipped: 0,
    todo: 0,
  });
  assert.deepEqual(
    aggregate.result.cases.map(item => [item.worker, item.status]),
    [['server-1', 'pass'], ['server-2', 'fail']]
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0], [
    ' ✓ tests/rstest/runtime/server/a.test.js (1)',
    ' × tests/rstest/runtime/server/b.test.js (1)',
    '',
    ' FAIL  beta fail 1',
    ' AssertionError: expected true',
    '',
    ' Test Files  1 failed | 1 passed (2)',
    '      Tests  1 failed | 1 passed (2)',
  ].join('\n'));
  assert.doesNotMatch(logs[0], /server-[12]/);
});

test('verbose worker aggregation attributes passing cases to their host', t => {
  const fixture = resultFixture(t);
  fixture.write(0, result({
    passed: 1,
    name: 'alpha',
    testPath: 'tests/rstest/runtime/server/a.test.js',
  }));
  fixture.write(1, result({
    passed: 1,
    name: 'beta',
    testPath: 'tests/rstest/runtime/server/b.test.js',
  }));
  const logs = [];

  const aggregate = aggregateRstestWorkerResults({
    descriptors: fixture.plan.descriptors,
    outcome: { workers: fixture.statuses },
    verbose: true,
    colors: false,
    log: line => logs.push(line),
  });

  assert.equal(aggregate.exitCode, 0);
  assert.match(logs[0], /✓ alpha pass 1 \(1ms\) \[server-1\]/);
  assert.match(logs[0], /✓ beta pass 1 \(1ms\) \[server-2\]/);
});

test('worker aggregation applies signal and infrastructure precedence', t => {
  const missing = resultFixture(t);
  missing.write(0, result({ passed: 1 }));
  assert.equal(aggregateRstestWorkerResults({
    descriptors: missing.plan.descriptors,
    outcome: { workers: missing.statuses },
    log() {},
  }).exitCode, 254);

  const signaled = resultFixture(t);
  signaled.write(0, result({ passed: 1 }));
  signaled.write(1, result({ failed: 1 }));
  signaled.statuses[0].signal = 'SIGTERM';
  signaled.statuses[0].code = null;
  assert.equal(aggregateRstestWorkerResults({
    descriptors: signaled.plan.descriptors,
    outcome: { workers: signaled.statuses },
    log() {},
  }).exitCode, 255);
});

test('worker aggregation rejects stale and inconsistent result payloads', t => {
  const fixture = resultFixture(t);
  fixture.write(0, result({ passed: 1 }));
  fixture.write(1, result({ passed: 1 }));
  const filename = fixture.plan.descriptors[1].payload.resultPath;
  const stale = JSON.parse(fs.readFileSync(filename, 'utf8'));
  stale.generation = 'abcdef1234567890abcdef1234567890';
  fs.writeFileSync(filename, JSON.stringify(stale));

  assert.equal(aggregateRstestWorkerResults({
    descriptors: fixture.plan.descriptors,
    outcome: { workers: fixture.statuses },
    log() {},
  }).exitCode, 254);
});
