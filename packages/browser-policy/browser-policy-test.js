var cspsEqual = function (csp1, csp2) {
  var cspToObj = function (csp) {
    csp = csp.substring(0, csp.length - 1);
    var parts = _.map(csp.split("; "), function (part) {
      return part.split(" ");
    });
    var keys = _.map(parts, _.first);
    var values = _.map(parts, _.rest);
    _.each(values, function (value) {
      value.sort();
    });
    return _.object(keys, values);
  };

  return EJSON.equals(cspToObj(csp1), cspToObj(csp2));
};

Tinytest.add("browser-policy - csp", function (test) {
  var defaultCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
        "connect-src * 'self'; img-src data: 'self'; style-src 'self' 'unsafe-inline';"
  BrowserPolicy.enableContentSecurityPolicy();

  // Default policy
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(), defaultCsp));
  test.isTrue(BrowserPolicy.inlineScriptsAllowed());

  // Redundant whitelisting (inline scripts already allowed in default policy)
  BrowserPolicy.allowInlineScripts();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(), defaultCsp));

  // Disallow inline scripts
  BrowserPolicy.disallowInlineScripts();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'self'; script-src 'self'; " +
                        "connect-src * 'self'; img-src data: 'self'; style-src 'self' 'unsafe-inline';"));
  test.isFalse(BrowserPolicy.inlineScriptsAllowed());

  // Allow eval
  BrowserPolicy.allowEval();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(), "default-src 'self'; script-src 'self' 'unsafe-eval'; " +
                        "connect-src * 'self'; img-src data: 'self'; style-src 'self' 'unsafe-inline';"));

  // Disallow inline styles
  BrowserPolicy.disallowInlineStyles();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(), "default-src 'self'; script-src 'self' 'unsafe-eval'; " +
                        "connect-src * 'self'; img-src data: 'self'; style-src 'self';"));

  // Allow data: urls everywhere
  BrowserPolicy.allowAllContentDataUrl();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'self' data:; script-src 'self' 'unsafe-eval' data:; " +
                        "connect-src * data: 'self'; img-src data: 'self'; style-src 'self' data:;"));

  // Disallow everything
  BrowserPolicy.disallowAllContent();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(), "default-src 'none';"));
  test.isFalse(BrowserPolicy.inlineScriptsAllowed());

  // Put inline scripts back in
  BrowserPolicy.allowInlineScripts();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'none'; script-src 'unsafe-inline';"));
  test.isTrue(BrowserPolicy.inlineScriptsAllowed());

  // Add 'self' to all content types
  BrowserPolicy.allowAllContentSameOrigin();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'self'; script-src 'self' 'unsafe-inline';"));
  test.isTrue(BrowserPolicy.inlineScriptsAllowed());

  // Disallow all content except same-origin scripts
  BrowserPolicy.disallowAllContent();
  BrowserPolicy.allowScriptSameOrigin();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'none'; script-src 'self';"));
  test.isFalse(BrowserPolicy.inlineScriptsAllowed());

  // Starting with all content same origin, disallowScript() and then allow
  // inline scripts. Result should be that that only inline scripts can execute,
  // not same-origin scripts.
  BrowserPolicy.disallowAllContent();
  BrowserPolicy.allowAllContentSameOrigin();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(), "default-src 'self';"));
  BrowserPolicy.disallowScript();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'self'; script-src 'none';"));
  BrowserPolicy.allowInlineScripts();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'self'; script-src 'unsafe-inline';"));

  // Starting with all content same origin, allow inline scripts. (Should result
  // in both same origin and inline scripts allowed.)
  BrowserPolicy.disallowAllContent();
  BrowserPolicy.allowAllContentSameOrigin();
  BrowserPolicy.allowInlineScripts();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'self'; script-src 'self' 'unsafe-inline';"));
  BrowserPolicy.disallowInlineScripts();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'self'; script-src 'self';"));

  // Allow same origin for all content, then disallow object entirely.
  BrowserPolicy.disallowAllContent();
  BrowserPolicy.allowAllContentSameOrigin();
  BrowserPolicy.disallowObject();
  test.isTrue(cspsEqual(BrowserPolicy._constructCsp(),
                        "default-src 'self'; object-src 'none';"));
});

Tinytest.add("browser-policy - x-frame-options", function (test) {
  BrowserPolicy._reset();
  BrowserPolicy.disallowFraming();
  test.equal(BrowserPolicy._constructXFrameOptions(), "DENY");
  BrowserPolicy.allowFramingBySameOrigin();
  test.equal(BrowserPolicy._constructXFrameOptions(), "SAMEORIGIN");
  BrowserPolicy.allowFramingByOrigin("foo.com");
  test.equal(BrowserPolicy._constructXFrameOptions(), "ALLOW-FROM foo.com");
  test.throws(function () {
    BrowserPolicy.allowFramingByOrigin("bar.com");
  });
  BrowserPolicy.allowFramingByAnyOrigin();
  test.isFalse(BrowserPolicy._constructXFrameOptions());
});
