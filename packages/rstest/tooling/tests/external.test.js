const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  RstestExternal,
  structuredResultFromReport,
} = require('../provider/external.js');

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
  const coverageGeneration = 'abcdef1234567890abcdef1234567890';
  const coverageArtifactPath = path.join(path.dirname(createReport(t)), 'e2e.json');
  fs.writeFileSync(coverageArtifactPath, '{}');
  const runner = new RstestExternal({
    appDir: '/app',
    url: 'http://localhost:3100/',
    args: ['--once', '--project', 'meteor-e2e'],
    token: 'test-token',
    generation: 7,
    resultPath: createReport(t),
    coverageGeneration,
    coverageArtifactPath,
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
      METEOR_RSTEST_COVERAGE_GENERATION: coverageGeneration,
      METEOR_RSTEST_COVERAGE_PRODUCER: 'e2e',
      METEOR_RSTEST_COVERAGE_TOKEN: 'test-token',
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

test('external result waits for the committed coverage artifact', async t => {
  const resultPath = createReport(t);
  const coverageArtifactPath = path.join(path.dirname(resultPath), 'e2e.json');
  let completeChild;
  const childCompletion = new Promise(resolve => { completeChild = resolve; });
  const calls = [];
  const runner = new RstestExternal({
    appDir: '/app',
    url: 'http://localhost:3100/',
    args: [],
    token: 'secret',
    generation: 2,
    coverageGeneration: 'abcdef1234567890abcdef1234567890',
    coverageArtifactPath,
    coverageWaitTimeoutMs: 1000,
    resultPath,
    startProcess() {
      return { completion: childCompletion, stop() {} };
    },
    async fetch(url) {
      calls.push(url);
      return { ok: true, status: 200 };
    },
  });

  const running = runner.start();
  completeChild(0);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(calls, []);
  fs.writeFileSync(coverageArtifactPath, '{}');
  await running;

  assert.deepEqual(calls, [
    'http://localhost:3100/__meteor__/rstest/external',
  ]);
});

test('external result endpoint preserves ROOT_URL path prefix', async t => {
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
});

test('external coverage wait fails deterministically without posting a result', async t => {
  let posted = false;
  const runner = new RstestExternal({
    appDir: '/app',
    url: 'http://localhost:3100/',
    args: [],
    token: 'secret',
    generation: 2,
    coverageGeneration: 'abcdef1234567890abcdef1234567890',
    coverageArtifactPath: path.join(path.dirname(createReport(t)), 'missing-e2e.json'),
    coverageWaitTimeoutMs: 5,
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
    /External coverage upload did not commit after 5ms/,
  );
  assert.equal(posted, false);
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
