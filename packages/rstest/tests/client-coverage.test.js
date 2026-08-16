const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const {
  completeClientRun,
  submitClientCoverage,
} = require('../client/coverage.js');
const { createCoverageFrameGate } = require('../runtime/coverage-protocol.js');

const generation = '1234567890abcdef1234567890abcdef';
const token = 'client-capability-token';

function coverageMap(hits = 1) {
  const filename = '/app/imports/client.js';
  return {
    [filename]: {
      path: filename,
      statementMap: {
        0: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: 10 },
        },
      },
      fnMap: {},
      branchMap: {},
      s: { 0: hits },
      f: {},
      b: {},
    },
  };
}

async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('client submits its test result then fully commits a cloned host map', async t => {
  const receiver = createCoverageFrameGate({ generation, token, producer: 'client' });
  let committed;
  const origin = await listen(t, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const frame = JSON.parse(body);
    receiver.submit(frame);
    if (frame.type === 'commit') committed = receiver.commit();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ accepted: true }));
  });
  const globalObject = { __coverage__: coverageMap(3) };
  const result = { ok: true };
  let submitted;
  const events = [];

  await completeClientRun({
    coverage: {
      enabled: true,
      generation,
      token,
      endpoint: `${origin}/__meteor__/rstest/coverage`,
    },
    token,
    globalObject,
    fetchImpl: (url, options) => {
      events.push('coverage');
      return fetch(url, {
        ...options,
        headers: { ...options.headers, origin },
      });
    },
    result,
    async submitResult(value) {
      events.push('result');
      submitted = value;
    },
  });

  assert.equal(submitted, result);
  assert.equal(events[0], 'result');
  assert.equal(committed.coverage['/app/imports/client.js'].s[0], 3);
  assert.equal(globalObject.__coverage__['/app/imports/client.js'].s[0], 3);
});

test('disabled client coverage performs no request or host-global access', async () => {
  let requests = 0;
  const globalObject = {};
  Object.defineProperty(globalObject, '__coverage__', {
    get() { throw new Error('disabled coverage read the host global'); },
  });

  const outcome = await submitClientCoverage({
    coverage: { enabled: false },
    globalObject,
    async fetchImpl() { requests += 1; },
  });

  assert.deepEqual(outcome, { submitted: false });
  assert.equal(requests, 0);
});

test('failed client result is submitted before malformed or rejected coverage surfaces', async t => {
  const failedResult = {
    ok: false,
    stats: { total: 1, passed: 0, failed: 1, skipped: 0, todo: 0 },
    cases: [{ name: 'client assertion', status: 'fail' }],
  };

  await t.test('malformed host map', async () => {
    const submitted = [];
    await assert.rejects(completeClientRun({
      coverage: { enabled: true, generation, token, endpoint: '/coverage' },
      token,
      result: failedResult,
      globalObject: { __coverage__: { malformed: true } },
      async fetchImpl() { throw new Error('fetch should not run'); },
      async submitResult(value) { submitted.push(value); },
    }), /Coverage/);
    assert.deepEqual(submitted, [failedResult]);
  });

  await t.test('rejected upload', async () => {
    const events = [];
    await assert.rejects(completeClientRun({
      coverage: { enabled: true, generation, token, endpoint: '/coverage' },
      token,
      result: failedResult,
      globalObject: { __coverage__: coverageMap() },
      async fetchImpl() {
        events.push('coverage');
        return { ok: false, status: 409, async json() { return {}; } };
      },
      async submitResult() { events.push('result'); },
    }), /rejected/);
    assert.deepEqual(events, ['result', 'coverage']);
  });
});
