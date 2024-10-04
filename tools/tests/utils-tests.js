var selftest = require('../tool-testing/selftest.js');
var utils = require('../utils/utils.js');

import { sha1 } from '../fs/watch';
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

selftest.define("resume downloads", ['net'], async function () {
  // A reasonably big file that (I think) should take more than 1s to download
  // and that we know the size of
  const url = 'https://warehouse.meteor.com/builds/EXSxwGqYjjJKh3WMJ/1467929945102/DRyKg3bYHL/babel-compiler-6.8.4-os+web.browser+web.cordova.tgz';

  let interruptCount = 0;
  let bytesSinceLastInterrupt = 0;

  const resumedPromise = Promise.resolve().then(
    () => httpHelpers.getUrlWithResuming({
      url: url,
      encoding: null,
      retryDelaySecs: 1,
      onRequest(request) {
        request.on("data", chunk => {
          bytesSinceLastInterrupt += chunk.length
          if (bytesSinceLastInterrupt > 500000) {
            bytesSinceLastInterrupt = 0;
            ++interruptCount;
            request.emit('error', 'pretend-http-error');
            request.emit('end');
            request.abort();
          }
        });
      }
    })
  );

  const normalPromise = Promise.resolve().then(
    () => httpHelpers.getUrl({
      url,
      encoding: null,
    })
  );

  try {
    await Promise.all([
      resumedPromise,
      normalPromise,
    ]).then(async bodies => {
      selftest.expectTrue(interruptCount > 1);

      await selftest.expectEqual(
        bodies[0].length,
        bodies[1].length
      );

      await selftest.expectEqual(
        sha1(bodies[0]),
        sha1(bodies[1])
      );
    })
  } catch (e) {
    // it trows a string pretend-http-error
  }
});
