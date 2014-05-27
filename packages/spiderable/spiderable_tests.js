var url = Npm.require("url");

Tinytest.add("spiderable - phantom url generation", function (test, expect) {
  var absUrl = "http://example.com";
  _.each([
    {
      requestUrl: "/?_escaped_fragment_=1",
      expected: "/"
    },
    // Test that query strings are preserved
    {
      requestUrl: "/?_escaped_fragment_=1&foo=bar",
      expected: "/?foo=bar"
    },
    {
      requestUrl: "/?foo=bar&_escaped_fragment_=1",
      expected: "/?foo=bar"
    },
    // Test that paths are preserved
    {
      requestUrl: "/foo/bar?_escaped_fragment_=1",
      expected: "/foo/bar"
    },
    {
      requestUrl: "/foo/bar?_escaped_fragment_=1&foo=bar",
      expected: "/foo/bar?foo=bar"
    },
    // Test with a path on the site's absolute url
    {
      requestUrl: "/foo/bar?_escaped_fragment_=1",
      expected: "/foo/bar",
      absUrl: "http://example.com/foo"
    },
    {
      requestUrl: "/bar?_escaped_fragment_=1",
      expected: "/bar",
      absUrl: "http://example.com/foo"
    }
  ], function (testCase) {
    testCase.absUrl = testCase.absUrl || absUrl;

    test.equal(
      Spiderable._urlForPhantom(absUrl, testCase.requestUrl),
      absUrl + testCase.expected
    );
  });
});
