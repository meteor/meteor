var selftest = require('../tool-testing/selftest.js');
var utils = require('../utils/utils.js');

import httpHelpers from '../utils/http-helpers';

selftest.define('subset generator', function () {
  var out = [];
  utils.generateSubsetsOfIncreasingSize(['a', 'b', 'c'], function (x) {
    out.push(x);
  });
  selftest.expectEqual(out, [
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
  selftest.expectEqual(out, [
    [],
    [ 'a' ],
    [ 'b' ],
    [ 'c' ],
    [ 'a', 'b' ],
    [ 'a', 'c' ]
  ]);
});

selftest.define("url has scheme", function () {
  // URL scheme must start with a letter, and then can be followed by
  // any number of alphanumerics, +, -, . RFC 2396 Appendix A.
  selftest.expectEqual(utils.hasScheme("http://example.com"), true);
  selftest.expectEqual(utils.hasScheme("https://example.com"), true);
  selftest.expectEqual(utils.hasScheme("ddp://example.com"), true);
  selftest.expectEqual(utils.hasScheme("http://example.com:80"), true);
  selftest.expectEqual(utils.hasScheme("https://example.com:443"), true);
  selftest.expectEqual(utils.hasScheme("ddp://example.com:443"), true);
  selftest.expectEqual(utils.hasScheme("ddp://example"), true);
  selftest.expectEqual(utils.hasScheme("ddp://"), true);
  selftest.expectEqual(utils.hasScheme("example.comhttp://"), true);
  selftest.expectEqual(utils.hasScheme("example+com+http://"), true);
  selftest.expectEqual(utils.hasScheme("example-com+http://"), true);

  selftest.expectEqual(utils.hasScheme("example"), false);
  selftest.expectEqual(utils.hasScheme("example.com"), false);
  selftest.expectEqual(utils.hasScheme("example.com:443"), false);
  selftest.expectEqual(utils.hasScheme("http:/example"), false);
  selftest.expectEqual(utils.hasScheme("http:example"), false);
  selftest.expectEqual(utils.hasScheme("example_com+http://"), false);
});

selftest.define("parse url", function () {
  selftest.expectEqual(utils.parseUrl("http://localhost:3000"), {
    hostname: "localhost",
    port: "3000",
    protocol: "http"
  });
  selftest.expectEqual(utils.parseUrl("https://localhost:3000"), {
    hostname: "localhost",
    port: "3000",
    protocol: "https"
  });
  selftest.expectEqual(utils.parseUrl("localhost:3000"), {
    hostname: "localhost",
    port: "3000",
    protocol: undefined
  });
  selftest.expectEqual(utils.parseUrl("3000"), {
    hostname: undefined,
    port: "3000",
    protocol: undefined
  });
  selftest.expectEqual(utils.parseUrl("3000example.com:3000"), {
    hostname: "3000example.com",
    port: "3000",
    protocol: undefined
  });
  selftest.expectEqual(utils.parseUrl("http://example.com:3000"), {
    hostname: "example.com",
    port: "3000",
    protocol: "http"
  });
  selftest.expectEqual(utils.parseUrl("https://example.com:3000"), {
    hostname: "example.com",
    port: "3000",
    protocol: "https"
  });
  selftest.expectEqual(utils.parseUrl("example.com:3000"), {
    hostname: "example.com",
    port: "3000",
    protocol: undefined
  });
  selftest.expectEqual(utils.parseUrl("127.0.0.1:3000"), {
    hostname: "127.0.0.1",
    port: "3000",
    protocol: undefined
  });
  selftest.expectEqual(utils.parseUrl("[::]:3000"), {
    hostname: "::",
    port: "3000",
    protocol: undefined
  });
  selftest.expectEqual(utils.parseUrl("http://[::]:3000"), {
    hostname: "::",
    port: "3000",
    protocol: "http"
  });
  selftest.expectEqual(utils.parseUrl("https://[::]:3000"), {
    hostname: "::",
    port: "3000",
    protocol: "https"
  });
  selftest.expectEqual(utils.parseUrl("[0000:0000:0000:0000:0000:0000:0000:0001]:3000"), {
    hostname: "0000:0000:0000:0000:0000:0000:0000:0001",
    port: "3000",
    protocol: undefined
  });

  // tests for defaults
  selftest.expectEqual(utils.parseUrl("http://example.com:3000", {
    hostname: "foo.com",
    port: "4000",
    protocol: "https"
  }), {
    hostname: "example.com",
    port: "3000",
    protocol: "http"
  });
  selftest.expectEqual(utils.parseUrl("example.com:3000", {
    port: "4000",
    protocol: "https"
  }), {
    hostname: "example.com",
    port: "3000",
    protocol: "https"
  });
  selftest.expectEqual(utils.parseUrl("3000", {
    port: "4000",
    protocol: "https",
    hostname: "example.com"
  }), {
    hostname: "example.com",
    port: "3000",
    protocol: "https"
  });
});

selftest.define("resume downloads", ['net', 'slow'], function () {
  // A reasonably big file that (I think) should take more than 1s to download
  // and that we know the size of
  const url = 'http://warehouse.meteor.com/builds/Pr7L8f6PqXyqNJJn4/1443478653127/aRiirNrp4v/meteor-tool-1.1.9-os.osx.x86_64+web.browser+web.cordova.tgz';

  const result = httpHelpers.getUrlWithResuming({
    // This doesn't affect the test, but if you remove the timeout above,
    // you can kill the connection manually by shutting down your network.
    // This makes it a bit faster
    timeout: 1000,
    url: url,
    encoding: null,
    wait: false,
    progress: {
      reportProgress({ current, end }) {
        const percent = current / end * 100;
        if (Math.random() < 0.01) {
          // Uncomment this when manually testing I guess
          // console.log(`${percent} %`);
        }
      },
      reportProgressDone() {}
    },
    onRequest(request) {
      setTimeout(() => {
        request.emit('error', 'pretend-http-error');
        request.emit('end');
      }, 1000);
    }
  });

  selftest.expectEqual(result.toString().length, 65041076);
});
