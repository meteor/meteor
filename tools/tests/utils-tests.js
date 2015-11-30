var selftest = require('../tool-testing/selftest.js');
var utils = require('../utils/utils.js');

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
    host: "localhost",
    port: "3000",
    protocol: "http://"
  });
  selftest.expectEqual(utils.parseUrl("https://localhost:3000"), {
    host: "localhost",
    port: "3000",
    protocol: "https://"
  });
  selftest.expectEqual(utils.parseUrl("localhost:3000"), {
    host: "localhost",
    port: "3000",
    protocol: undefined
  });
  selftest.expectEqual(utils.parseUrl("3000"), {
    host: undefined,
    port: "3000",
    protocol: undefined
  });
  selftest.expectEqual(utils.parseUrl("3000example.com:3000"), {
    host: "3000example.com",
    port: "3000",
    protocol: undefined
  });
  selftest.expectEqual(utils.parseUrl("http://example.com:3000"), {
    host: "example.com",
    port: "3000",
    protocol: "http://"
  });
  selftest.expectEqual(utils.parseUrl("https://example.com:3000"), {
    host: "example.com",
    port: "3000",
    protocol: "https://"
  });
  selftest.expectEqual(utils.parseUrl("example.com:3000"), {
    host: "example.com",
    port: "3000",
    protocol: undefined
  });

  // tests for defaults
  selftest.expectEqual(utils.parseUrl("http://example.com:3000", {
    host: "foo.com",
    port: "4000",
    protocol: "https://"
  }), {
    host: "example.com",
    port: "3000",
    protocol: "http://"
  });
  selftest.expectEqual(utils.parseUrl("example.com:3000", {
    port: "4000",
    protocol: "https://"
  }), {
    host: "example.com",
    port: "3000",
    protocol: "https://"
  });
  selftest.expectEqual(utils.parseUrl("3000", {
    port: "4000",
    protocol: "https://",
    host: "example.com"
  }), {
    host: "example.com",
    port: "3000",
    protocol: "https://"
  });
});
