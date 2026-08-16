const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  RstestExternal,
  structuredResultFromReport,
} = require('../provider/external.js');
const coverageSupport = require('../../../../npm-packages/meteor-rstest/src/coverage/playwright.js');
const {
  createCoverageFrameGate,
} = require('../../runtime/coverage-protocol.js');

const coverageGeneration = 'abcdef1234567890abcdef1234567890';
const shardWorkerScript = String.raw`
  const fs = require('node:fs');
  const support = require(process.argv[1]);
  const wait = delay => new Promise(resolve => setTimeout(resolve, delay));
  (async () => {
    fs.writeFileSync(process.env.METEOR_RSTEST_TEST_READY, '', { flag: 'wx' });
    while (!fs.existsSync(process.env.METEOR_RSTEST_TEST_BARRIER)) await wait(5);
    const coverage = JSON.parse(Buffer.from(
      process.env.METEOR_RSTEST_TEST_COVERAGE,
      'base64',
    ).toString('utf8'));
    const page = {
      async close() {},
      async evaluate(callback) {
        if (callback.name === 'readBrowserCoverage') {
          return {
            documentId: process.env.METEOR_RSTEST_TEST_SHARD_ID,
            coverage,
          };
        }
      },
      isClosed() { return false; },
    };
    const context = {
      async addInitScript() {},
      async close() {},
      async exposeBinding() {},
      async newPage() { return page; },
      on() {},
      pages() { return [page]; },
    };
    const browser = {
      async close() {},
      contexts() { return [context]; },
      async newContext() { return context; },
    };
    const collector = support.createPlaywrightCoverageCollector({
      enabled: true,
      generation: process.env.METEOR_RSTEST_COVERAGE_GENERATION,
    });
    await collector.install({ browser, context, page });
    await collector.writeShard({
      directory: process.env.METEOR_RSTEST_COVERAGE_SHARD_DIR,
      shardId: process.env.METEOR_RSTEST_TEST_SHARD_ID,
    });
  })().catch(error => {
    process.stderr.write(error.stack || String(error));
    process.exitCode = 1;
  });
`;

function startShardWorker({ env, supportPath, shardId, coverage, ready, barrier }) {
  const child = spawn(process.execPath, ['-e', shardWorkerScript, supportPath], {
    env: {
      ...env,
      METEOR_RSTEST_TEST_BARRIER: barrier,
      METEOR_RSTEST_TEST_COVERAGE: Buffer.from(JSON.stringify(coverage)).toString('base64'),
      METEOR_RSTEST_TEST_READY: ready,
      METEOR_RSTEST_TEST_SHARD_ID: shardId,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve({ code, stderr }));
  });
  return { child, completion };
}

async function waitForPaths(paths, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!paths.every(filename => fs.existsSync(filename))) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for shard workers.');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function fileCoverage(filename, hits) {
  return {
    path: filename,
    statementMap: {
      0: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 8 },
      },
    },
    fnMap: {},
    branchMap: {},
    s: { 0: hits },
    f: {},
    b: {},
  };
}

function createReport(t, tests = [{
  name: 'external case',
  fullName: 'suite > external case',
  status: 'pass',
  duration: 12,
}]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-external-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const resultPath = path.join(directory, 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify({ tests, files: [] }));
  return resultPath;
}

test('external Rstest run targets ready Meteor app and submits structured result', async t => {
  const calls = [];
  const runner = new RstestExternal({
    appDir: '/app',
    url: 'http://localhost:3100/',
    args: ['--once', '--project', 'meteor-e2e'],
    token: 'test-token',
    generation: 7,
    resultPath: createReport(t),
    startProcess(options) {
      calls.push(['start', options]);
      return {
        completion: Promise.resolve(0),
        stop() { calls.push(['stop']); },
      };
    },
    async fetch(url, options) {
      calls.push(['fetch', url, options]);
      return { ok: true, status: 200 };
    },
  });

  await runner.start();
  await runner.stop();

  assert.deepEqual(calls[0], ['start', {
    appDir: '/app',
    args: ['--once', '--project', 'meteor-e2e'],
    env: {
      ...process.env,
      METEOR_RSTEST_BASE_URL: 'http://localhost:3100/',
    },
  }]);
  assert.equal(calls[1][0], 'fetch');
  assert.equal(calls[1][1], 'http://localhost:3100/__meteor__/rstest/external');
  assert.equal(calls[1][2].method, 'POST');
  assert.equal(calls[1][2].headers['x-meteor-rstest-token'], 'test-token');
  const payload = JSON.parse(calls[1][2].body);
  assert.equal(payload.generation, 7);
  assert.equal(payload.result.ok, true);
  assert.equal(payload.result.cases[0].fullName, 'suite > external case');
});

test('parallel external files merge shards into one commit before result', async t => {
  const inheritedCoverageToken = process.env.METEOR_RSTEST_COVERAGE_TOKEN;
  process.env.METEOR_RSTEST_COVERAGE_TOKEN = 'must-not-reach-child';
  t.after(() => {
    if (inheritedCoverageToken === undefined) {
      delete process.env.METEOR_RSTEST_COVERAGE_TOKEN;
    } else {
      process.env.METEOR_RSTEST_COVERAGE_TOKEN = inheritedCoverageToken;
    }
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-external-shards-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coverageRoot = path.join(root, coverageGeneration);
  const coverageShardDirectory = path.join(coverageRoot, 'e2e-shards');
  const coverageArtifactPath = path.join(coverageRoot, 'e2e.json');
  const supportPath = require.resolve(
    '../../../../npm-packages/meteor-rstest/src/coverage/playwright.js',
  );
  const barrier = path.join(root, 'release-workers');
  const ready = [path.join(root, 'worker-one-ready'), path.join(root, 'worker-two-ready')];
  const gate = createCoverageFrameGate({
    generation: coverageGeneration,
    token: 'coverage-token',
    producer: 'e2e',
  });
  const events = [];
  let childEnv;
  let artifact;
  let commitCount = 0;
  let childCompleted = false;
  let workers = [];
  t.after(() => {
    for (const worker of workers) {
      if (worker.child.exitCode === null) worker.child.kill();
    }
  });
  const runner = new RstestExternal({
    appDir: '/app',
    url: 'http://localhost:3100/',
    args: [],
    token: 'coverage-token',
    generation: 3,
    resultPath: createReport(t),
    coverageGeneration,
    coverageArtifactPath,
    coverageShardDirectory,
    coverageSupport,
    startProcess({ env }) {
      childEnv = env;
      workers = [
        startShardWorker({
          env,
          supportPath,
          shardId: '11111111111111111111111111111111',
          coverage: {
            '/app/imports/shared.js': fileCoverage('/app/imports/shared.js', 1),
            '/app/imports/first.js': fileCoverage('/app/imports/first.js', 2),
          },
          ready: ready[0],
          barrier,
        }),
        startShardWorker({
          env,
          supportPath,
          shardId: '22222222222222222222222222222222',
          coverage: {
            '/app/imports/shared.js': fileCoverage('/app/imports/shared.js', 3),
            '/app/imports/second.js': fileCoverage('/app/imports/second.js', 4),
          },
          ready: ready[1],
          barrier,
        }),
      ];
      const completion = (async () => {
        await waitForPaths(ready);
        assert.equal(fs.existsSync(coverageShardDirectory), false);
        fs.writeFileSync(barrier, 'release');
        const results = await Promise.all(workers.map(worker => worker.completion));
        assert.deepEqual(results.map(result => result.code), [0, 0],
          results.map(result => result.stderr).join('\n'));
        childCompleted = true;
        return 0;
      })();
      return {
        completion,
        stop() {
          for (const worker of workers) worker.child.kill();
        },
      };
    },
    async fetch(url, options) {
      if (url.endsWith('/coverage')) {
        assert.equal(childCompleted, true);
        assert.equal(options.headers.origin, 'http://localhost:3100');
        const frame = JSON.parse(options.body);
        events.push(`coverage:${frame.type}`);
        const accepted = gate.submit(frame);
        if (accepted.committed) {
          artifact = gate.commit();
          commitCount += 1;
          fs.writeFileSync(coverageArtifactPath, JSON.stringify(artifact));
        }
      } else {
        events.push('result');
      }
      return { ok: true, status: 200 };
    },
  });

  await runner.start();

  assert.equal(commitCount, 1);
  assert.equal(childCompleted, true);
  assert.deepEqual(events, [
    'coverage:begin',
    'coverage:chunk',
    'coverage:commit',
    'result',
  ]);
  assert.equal(artifact.coverage['/app/imports/shared.js'].s[0], 4);
  assert.equal(artifact.coverage['/app/imports/first.js'].s[0], 2);
  assert.equal(artifact.coverage['/app/imports/second.js'].s[0], 4);
  assert.equal(fs.existsSync(coverageShardDirectory), false);
  assert.equal(childEnv.METEOR_RSTEST_COVERAGE_SHARD_DIR, coverageShardDirectory);
  assert.equal(childEnv.METEOR_RSTEST_COVERAGE_GENERATION, coverageGeneration);
  assert.equal(childEnv.METEOR_RSTEST_COVERAGE_PRODUCER, 'e2e');
  assert.equal('METEOR_RSTEST_COVERAGE_TOKEN' in childEnv, false);
});

test('external coverage upload waits for child completion and precedes result', async t => {
  const resultPath = createReport(t);
  const coverageRoot = path.join(path.dirname(resultPath), coverageGeneration);
  const coverageShardDirectory = path.join(coverageRoot, 'e2e-shards');
  const coverageArtifactPath = path.join(coverageRoot, 'e2e.json');
  await coverageSupport.writeCoverageShard({
    directory: coverageShardDirectory,
    generation: coverageGeneration,
    shardId: '33333333333333333333333333333333',
    coverage: {
      '/app/imports/only.js': fileCoverage('/app/imports/only.js', 1),
    },
  });
  const gate = createCoverageFrameGate({
    generation: coverageGeneration,
    token: 'secret',
    producer: 'e2e',
  });
  let completeChild;
  const childCompletion = new Promise(resolve => { completeChild = resolve; });
  const calls = [];
  const runner = new RstestExternal({
    appDir: '/app',
    url: 'http://localhost:3100/',
    args: [],
    token: 'secret',
    generation: 2,
    coverageGeneration,
    coverageArtifactPath,
    coverageShardDirectory,
    coverageSupport,
    resultPath,
    startProcess() {
      return { completion: childCompletion, stop() {} };
    },
    async fetch(url, options) {
      calls.push(url);
      if (url.endsWith('/coverage')) {
        const accepted = gate.submit(JSON.parse(options.body));
        if (accepted.committed) {
          fs.writeFileSync(coverageArtifactPath, JSON.stringify(gate.commit()));
        }
      }
      return { ok: true, status: 200 };
    },
  });

  const running = runner.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, []);
  completeChild(0);
  await running;

  assert.deepEqual(calls, [
    'http://localhost:3100/__meteor__/rstest/coverage',
    'http://localhost:3100/__meteor__/rstest/coverage',
    'http://localhost:3100/__meteor__/rstest/coverage',
    'http://localhost:3100/__meteor__/rstest/external',
  ]);
});

test('external result endpoint preserves ROOT_URL path prefix', async t => {
  const ownedCoverageEnv = [
    'METEOR_RSTEST_COVERAGE_TOKEN',
    'METEOR_RSTEST_COVERAGE_GENERATION',
    'METEOR_RSTEST_COVERAGE_PRODUCER',
    'METEOR_RSTEST_COVERAGE_SHARD_DIR',
  ];
  const previousCoverageEnv = Object.fromEntries(
    ownedCoverageEnv.map(name => [name, process.env[name]]),
  );
  for (const name of ownedCoverageEnv) process.env[name] = `stale-${name}`;
  t.after(() => {
    for (const name of ownedCoverageEnv) {
      if (previousCoverageEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousCoverageEnv[name];
    }
  });
  let submittedUrl;
  let childEnv;
  const runner = new RstestExternal({
    appDir: '/app',
    url: 'http://localhost:3100/nested/app/',
    args: [],
    token: 'token',
    resultPath: createReport(t),
    startProcess({ env }) {
      childEnv = env;
      return { completion: Promise.resolve(0), stop() {} };
    },
    async fetch(url) {
      submittedUrl = url;
      return { ok: true, status: 200 };
    },
  });
  await runner.start();
  assert.equal(
    submittedUrl,
    'http://localhost:3100/nested/app/__meteor__/rstest/external',
  );
  assert.equal('METEOR_RSTEST_COVERAGE_TOKEN' in childEnv, false);
  assert.equal('METEOR_RSTEST_COVERAGE_GENERATION' in childEnv, false);
  assert.equal('METEOR_RSTEST_COVERAGE_PRODUCER' in childEnv, false);
  assert.equal('METEOR_RSTEST_COVERAGE_SHARD_DIR' in childEnv, false);
});

test('external coverage fails deterministically without shards or posting a result', async t => {
  let posted = false;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-empty-shards-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coverageShardDirectory = path.join(root, coverageGeneration, 'e2e-shards');
  fs.mkdirSync(coverageShardDirectory, { recursive: true, mode: 0o700 });
  const runner = new RstestExternal({
    appDir: '/app',
    url: 'http://localhost:3100/',
    args: [],
    token: 'secret',
    generation: 2,
    coverageGeneration,
    coverageArtifactPath: path.join(root, coverageGeneration, 'e2e.json'),
    coverageShardDirectory,
    coverageSupport,
    resultPath: createReport(t),
    startProcess() {
      return { completion: Promise.resolve(0), stop() {} };
    },
    async fetch() {
      posted = true;
      return { ok: true, status: 200 };
    },
  });

  await assert.rejects(
    runner.start(),
    /produced no Playwright coverage shards/,
  );
  assert.equal(posted, false);
  assert.equal(fs.existsSync(coverageShardDirectory), false);
});

test('external JSON report preserves failed cases and errors', () => {
  const result = structuredResultFromReport({
    tests: [{
      name: 'fails',
      fullName: 'suite > fails',
      status: 'fail',
      errors: [{ name: 'AssertionError', message: 'expected 1 to be 2' }],
    }],
    files: [],
  }, 1);

  assert.deepEqual(result.stats, {
    total: 1,
    passed: 0,
    failed: 1,
    skipped: 0,
    todo: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.cases[0].error.name, 'AssertionError');
});
