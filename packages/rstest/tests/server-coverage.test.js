const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { serializeCoverageFrames } = require('../runtime/coverage-protocol.js');
const {
  createServerCoverageLifecycle,
} = require('../server/coverage.js');

const generation = '1234567890abcdef1234567890abcdef';
const token = 'client-capability-token';

function coverageMap(filename, hits = 1) {
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

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rstest-server-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifactRoot = path.join(root, generation);
  return {
    enabled: true,
    generation,
    token,
    endpoint: '/__meteor__/rstest/coverage',
    artifactRoot,
    artifacts: {
      server: path.join(artifactRoot, 'server.json'),
      client: path.join(artifactRoot, 'client.json'),
    },
    ...overrides,
  };
}

async function post({ port, frame, origin, requestToken = token }) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/__meteor__/rstest/coverage',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-meteor-rstest-token': requestToken,
        origin,
      },
    }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
    request.end(JSON.stringify(frame));
  });
}

test('endpoint publishes client artifact only after authenticated commit', async t => {
  const coverage = fixture(t);
  const lifecycle = createServerCoverageLifecycle({
    coverage,
    expectsClient: true,
    globalObject: { __coverage__: coverageMap('/app/server.js') },
  });
  const server = http.createServer((request, response) =>
    lifecycle.handler(request, response, () => {
      response.writeHead(404);
      response.end();
    })
  );
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const frames = serializeCoverageFrames({
    generation,
    token,
    producer: 'client',
    coverage: coverageMap('/app/client.js', 4),
  });

  for (const frame of frames.slice(0, -1)) {
    assert.equal((await post({ port, frame, origin })).status, 200);
  }
  assert.equal(fs.existsSync(coverage.artifacts.client), false);
  assert.equal((await post({ port, frame: frames.at(-1), origin })).status, 200);
  await lifecycle.waitForClient();

  const artifact = JSON.parse(fs.readFileSync(coverage.artifacts.client, 'utf8'));
  assert.equal(artifact.coverage['/app/client.js'].s[0], 4);
  assert.equal('token' in artifact, false);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(coverage.artifacts.client).mode & 0o777, 0o600);
  }
});

test('endpoint rejects cross-origin, wrong-token, and replay requests', async t => {
  const coverage = fixture(t);
  const lifecycle = createServerCoverageLifecycle({
    coverage,
    expectsClient: true,
    globalObject: { __coverage__: {} },
  });
  const server = http.createServer(lifecycle.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const frames = serializeCoverageFrames({
    generation,
    token,
    producer: 'client',
    coverage: {},
  });

  assert.equal((await post({
    port,
    frame: frames[0],
    origin: 'https://attacker.invalid',
  })).status, 403);
  assert.equal((await post({
    port,
    frame: frames[0],
    origin: `https://127.0.0.1:${port}`,
  })).status, 403);
  assert.equal((await post({
    port,
    frame: frames[0],
    origin,
    requestToken: 'wrong-token',
  })).status, 403);
  for (const frame of frames) {
    assert.equal((await post({ port, frame, origin })).status, 200);
  }
  assert.equal((await post({ port, frame: frames.at(-1), origin })).status, 409);
});

test('server captures after failed tests before waiting for client coverage', async t => {
  const coverage = fixture(t);
  const lifecycle = createServerCoverageLifecycle({
    coverage,
    expectsClient: true,
    globalObject: { __coverage__: coverageMap('/app/server.js', 2) },
  });

  lifecycle.captureServer({ testResult: { ok: false } });
  assert.equal(fs.existsSync(coverage.artifacts.server), true);
  const artifact = JSON.parse(fs.readFileSync(coverage.artifacts.server, 'utf8'));
  assert.equal(artifact.coverage['/app/server.js'].s[0], 2);
});

test('authenticated malformed frame fails the expected client commit', async t => {
  const coverage = fixture(t);
  const lifecycle = createServerCoverageLifecycle({
    coverage,
    expectsClient: true,
    globalObject: { __coverage__: {} },
    timeoutMs: 50,
  });
  const server = http.createServer(lifecycle.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const frame = serializeCoverageFrames({
    generation,
    token,
    producer: 'client',
    coverage: {},
  })[0];

  assert.equal((await post({
    port,
    frame: { ...frame, token: 'wrong-frame-token' },
    origin,
  })).status, 400);
  await assert.rejects(
    lifecycle.waitForClient(),
    error => error.code === 'METEOR_RSTEST_COVERAGE_AUTH',
  );
});

test('disabled server coverage registers no handler and performs no writes', t => {
  const coverage = fixture(t, { enabled: false });
  const globalObject = {};
  Object.defineProperty(globalObject, '__coverage__', {
    get() { throw new Error('disabled coverage read the host global'); },
  });
  const lifecycle = createServerCoverageLifecycle({
    coverage,
    expectsClient: true,
    globalObject,
  });

  assert.equal(lifecycle.handler, null);
  assert.deepEqual(lifecycle.captureServer(), { captured: false });
  assert.equal(fs.existsSync(coverage.artifacts.server), false);
});

test('missing expected client commit rejects the coverage wait', async t => {
  const lifecycle = createServerCoverageLifecycle({
    coverage: fixture(t),
    expectsClient: true,
    globalObject: { __coverage__: {} },
    timeoutMs: 5,
  });

  await assert.rejects(
    Promise.race([
      lifecycle.waitForClient(),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('coverage wait remained pending')),
        50,
      )),
    ]),
    /Did not receive Meteor client coverage commit after 5ms/,
  );
});
