var selftest = require('../tool-testing/selftest.js');
var utils = require('../utils/utils.js');

import assert from 'node:assert/strict';
import http from 'node:http';
import { OfflineError } from '../fs/files';
import httpHelpers from '../utils/http-helpers';

selftest.define('subset generator', async function () {
  var out = [];
  utils.generateSubsetsOfIncreasingSize(['a', 'b', 'c'], function (x) {
    out.push(x);
  });
  await selftest.expectEqual(out, [
    [],
    [ 'a' ],
    [ 'b' ],
    [ 'c' ],
    [ 'a', 'b' ],
    [ 'a', 'c' ],
    [ 'b', 'c' ],
    [ 'a', 'b', 'c' ]
  ]);
  out = [];
  utils.generateSubsetsOfIncreasingSize(['a', 'b', 'c'], function (x) {
    out.push(x);
    if (x[1] === 'c') {
      // stop iterating
      return true;
    }
  });
  await selftest.expectEqual(out, [
    [],
    [ 'a' ],
    [ 'b' ],
    [ 'c' ],
    [ 'a', 'b' ],
    [ 'a', 'c' ]
  ]);
});

selftest.define("url has scheme", async function () {
  // URL scheme must start with a letter, and then can be followed by
  // any number of alphanumerics, +, -, . RFC 2396 Appendix A.
  await selftest.expectEqual(utils.hasScheme("http://example.com"), true);
  await selftest.expectEqual(utils.hasScheme("https://example.com"), true);
  await selftest.expectEqual(utils.hasScheme("ddp://example.com"), true);
  await selftest.expectEqual(utils.hasScheme("http://example.com:80"), true);
  await selftest.expectEqual(utils.hasScheme("https://example.com:443"), true);
  await selftest.expectEqual(utils.hasScheme("ddp://example.com:443"), true);
  await selftest.expectEqual(utils.hasScheme("ddp://example"), true);
  await selftest.expectEqual(utils.hasScheme("ddp://"), true);
  await selftest.expectEqual(utils.hasScheme("example.comhttp://"), true);
  await selftest.expectEqual(utils.hasScheme("example+com+http://"), true);
  await selftest.expectEqual(utils.hasScheme("example-com+http://"), true);

  await selftest.expectEqual(utils.hasScheme("example"), false);
  await selftest.expectEqual(utils.hasScheme("example.com"), false);
  await selftest.expectEqual(utils.hasScheme("example.com:443"), false);
  await selftest.expectEqual(utils.hasScheme("http:/example"), false);
  await selftest.expectEqual(utils.hasScheme("http:example"), false);
  await selftest.expectEqual(utils.hasScheme("example_com+http://"), false);
});


selftest.define("isNpmUrl", function () {
    selftest.expectTrue(utils.isNpmUrl("https://github.com/caolan/async/archive/v2.3.0.tar.gz"));
    selftest.expectTrue(utils.isNpmUrl("http://github.com/caolan/async/archive/v2.3.0.tar.gz"));
    selftest.expectTrue(utils.isNpmUrl("git://github.com/foo/bar"));
    selftest.expectTrue(utils.isNpmUrl("git+ssh://github.com/foo/bar"));
    selftest.expectTrue(utils.isNpmUrl("git+http://github.com/foo/bar"));
    selftest.expectTrue(utils.isNpmUrl("git+https://github.com/foo/bar"));
});

selftest.define("parse url", async function () {
  await selftest.expectEqual(utils.parseUrl("http://localhost:3000"), {
    hostname: "localhost",
    port: "3000",
    protocol: "http"
  });
  await selftest.expectEqual(utils.parseUrl("https://localhost:3000"), {
    hostname: "localhost",
    port: "3000",
    protocol: "https"
  });
  await selftest.expectEqual(utils.parseUrl("localhost:3000"), {
    hostname: "localhost",
    port: "3000",
    protocol: undefined
  });
  await selftest.expectEqual(utils.parseUrl("3000"), {
    hostname: undefined,
    port: "3000",
    protocol: undefined
  });
  await selftest.expectEqual(utils.parseUrl("3000example.com:3000"), {
    hostname: "3000example.com",
    port: "3000",
    protocol: undefined
  });
  await selftest.expectEqual(utils.parseUrl("http://example.com:3000"), {
    hostname: "example.com",
    port: "3000",
    protocol: "http"
  });
  await selftest.expectEqual(utils.parseUrl("https://example.com:3000"), {
    hostname: "example.com",
    port: "3000",
    protocol: "https"
  });
  await selftest.expectEqual(utils.parseUrl("example.com:3000"), {
    hostname: "example.com",
    port: "3000",
    protocol: undefined
  });
  await selftest.expectEqual(utils.parseUrl("127.0.0.1:3000"), {
    hostname: "127.0.0.1",
    port: "3000",
    protocol: undefined
  });
  await selftest.expectEqual(utils.parseUrl("[::]:3000"), {
    hostname: "::",
    port: "3000",
    protocol: undefined
  });
  await selftest.expectEqual(utils.parseUrl("http://[::]:3000"), {
    hostname: "::",
    port: "3000",
    protocol: "http"
  });
  await selftest.expectEqual(utils.parseUrl("https://[::]:3000"), {
    hostname: "::",
    port: "3000",
    protocol: "https"
  });
  await selftest.expectEqual(utils.parseUrl("[0000:0000:0000:0000:0000:0000:0000:0001]:3000"), {
    hostname: "0000:0000:0000:0000:0000:0000:0000:0001",
    port: "3000",
    protocol: undefined
  });

  // tests for defaults
  await selftest.expectEqual(utils.parseUrl("http://example.com:3000", {
    hostname: "foo.com",
    port: "4000",
    protocol: "https"
  }), {
    hostname: "example.com",
    port: "3000",
    protocol: "http"
  });
  await selftest.expectEqual(utils.parseUrl("example.com:3000", {
    port: "4000",
    protocol: "https"
  }), {
    hostname: "example.com",
    port: "3000",
    protocol: "https"
  });
  await selftest.expectEqual(utils.parseUrl("3000", {
    port: "4000",
    protocol: "https",
    hostname: "example.com"
  }), {
    hostname: "example.com",
    port: "3000",
    protocol: "https"
  });
});

async function withDownloadServer(listener, run) {
  const server = http.createServer(listener);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/package.tgz`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

selftest.define("resume downloads", async function () {
  const payload = Buffer.from('meteor package contents');
  const ranges = [];
  let interruptedResponse;

  await withDownloadServer((request, response) => {
    const range = request.headers.range;
    ranges.push(range);
    const start = range ? Number(/^bytes=(\d+)-$/.exec(range)[1]) : 0;
    response.writeHead(start ? 206 : 200, {
      'Content-Length': payload.length - start,
      ...(start ? { 'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {}),
    });
    if (ranges.length <= 2) {
      interruptedResponse = response;
      response.write(payload.subarray(start, start + 6));
    } else {
      response.end(payload.subarray(start));
    }
  }, async url => {
    const body = await httpHelpers.getUrlWithResuming({
      url,
      encoding: null,
      retryDelaySecs: 0,
      // Progress must allow resuming even when the no-progress budget is zero.
      maxAttempts: 0,
      onRequest(request) {
        request.once('data', () => {
          // Wait until the client receives the partial body before dropping TCP.
          interruptedResponse?.destroy();
          interruptedResponse = null;
        });
      },
    });
    assert.deepEqual(body, payload);
    assert.deepEqual(ranges, [undefined, 'bytes=6-', 'bytes=12-']);
  });
});

selftest.define("resume downloads - exhausted retries", async function () {
  let requests = 0;
  await withDownloadServer((request, response) => {
    requests++;
    response.destroy();
  }, async url => {
    await assert.rejects(httpHelpers.getUrlWithResuming({
      url,
      retryDelaySecs: 0,
      maxAttempts: 2,
    }), error => error instanceof OfflineError && error.error.code === 'ECONNRESET');
    assert.equal(requests, 3, 'the initial request and two retries must run');
  });
});
