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

test('external result endpoint preserves ROOT_URL path prefix', async t => {
  let submittedUrl;
  const runner = new RstestExternal({
    appDir: '/app',
    url: 'http://localhost:3100/nested/app/',
    args: [],
    token: 'token',
    resultPath: createReport(t),
    startProcess() {
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
