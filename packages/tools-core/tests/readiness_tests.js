import { waitForHttpReady } from "../lib/readiness.js";

const http = require('http');

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}/`);
    });
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

Tinytest.addAsync("tools-core - waitForHttpReady - waits for valid response", async test => {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    if (requests === 1) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('warming up');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ready');
  });

  const url = await listen(server);
  try {
    const result = await waitForHttpReady(url, {
      timeoutMs: 1000,
      intervalMs: 20,
      requestTimeoutMs: 200,
    });

    test.isTrue(result.ok);
    test.equal(result.response.statusCode, 200);
    test.isTrue(result.attempts >= 2);
  } finally {
    await close(server);
  }
});

Tinytest.addAsync("tools-core - waitForHttpReady - supports validators", async test => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>not enough</html>');
  });

  const url = await listen(server);
  try {
    const result = await waitForHttpReady(url, {
      timeoutMs: 80,
      intervalMs: 20,
      requestTimeoutMs: 200,
      validateResponse: response => response.body.includes('ready-marker'),
    });

    test.isFalse(result.ok);
    test.isTrue(result.timedOut);
    test.equal(result.response.statusCode, 200);
  } finally {
    await close(server);
  }
});

Tinytest.addAsync("tools-core - waitForHttpReady - follows redirects", async test => {
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(302, { location: '/ready' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ready');
  });

  const url = await listen(server);
  try {
    const result = await waitForHttpReady(url, {
      timeoutMs: 1000,
      intervalMs: 20,
      requestTimeoutMs: 200,
    });

    test.isTrue(result.ok);
    test.isTrue(result.response.redirected);
    test.equal(result.response.body, 'ready');
  } finally {
    await close(server);
  }
});

Tinytest.addAsync("tools-core - waitForHttpReady - reports connection timeout", async test => {
  const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('unused');
  });

  const url = await listen(server);
  await close(server);

  const result = await waitForHttpReady(url, {
    timeoutMs: 80,
    intervalMs: 20,
    requestTimeoutMs: 50,
  });

  test.isFalse(result.ok);
  test.isTrue(result.timedOut);
  test.isTrue(!!result.error);
});
