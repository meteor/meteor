var url = Npm.require("url");
var crypto = Npm.require("crypto");
var http = Npm.require("http");

var additionalScript = "(function () { var foo = 1; })";
WebAppInternals.addStaticJs(additionalScript);
var hash = crypto.createHash('sha1');
hash.update(additionalScript);
var additionalScriptPathname = hash.digest('hex') + ".js";

// Mock the 'res' object that gets passed to connect handlers. This mock
// just records any utf8 data written to the response and returns it
// when you call `mockResponse.getBody()`.
var MockResponse = function () {
  this.buffer = "";
  this.statusCode = null;
};

MockResponse.prototype.writeHead = function (statusCode) {
  this.statusCode = statusCode;
};

MockResponse.prototype.setHeader = function (name, value) {
  // nothing
};

MockResponse.prototype.write = function (data, encoding) {
  if (! encoding || encoding === "utf8") {
    this.buffer = this.buffer + data;
  }
};

MockResponse.prototype.end = function (data, encoding) {
  if (! encoding || encoding === "utf8") {
    if (data) {
      this.buffer = this.buffer + data;
    }
  }
};

MockResponse.prototype.getBody = function () {
  return this.buffer;
};



Tinytest.add("webapp - content-type header", function (test) {
  var cssResource = _.find(
    _.keys(WebAppInternals.staticFiles),
    function (url) {
      return WebAppInternals.staticFiles[url].type === "css";
    }
  );
  var jsResource = _.find(
    _.keys(WebAppInternals.staticFiles),
    function (url) {
      return WebAppInternals.staticFiles[url].type === "js";
    }
  );

  var resp = HTTP.get(url.resolve(Meteor.absoluteUrl(), cssResource));
  test.equal(resp.headers["content-type"].toLowerCase(),
             "text/css; charset=utf-8");
  resp = HTTP.get(url.resolve(Meteor.absoluteUrl(), jsResource));
  test.equal(resp.headers["content-type"].toLowerCase(),
             "application/javascript; charset=utf-8");
});

Tinytest.add("webapp - additional static javascript", function (test) {
  var origInlineScriptsAllowed = WebAppInternals.inlineScriptsAllowed();

  var staticFilesOpts = {
    staticFiles: {},
    clientDir: "/"
  };

  // It's okay to set this global state because we're not going to yield
  // before settng it back to what it was originally.
  WebAppInternals.setInlineScriptsAllowed(true);

  Meteor._noYieldsAllowed(function () {
    var boilerplate = WebAppInternals.getBoilerplate({
      browser: "doesn't-matter",
      url: "also-doesnt-matter"
    }, "web.browser");

    // When inline scripts are allowed, the script should be inlined.
    test.isTrue(boilerplate.indexOf(additionalScript) !== -1);

    // And the script should not be served as its own separate resource,
    // meaning that the static file handler should pass on this request.
    var res = new MockResponse();
    var req = new http.IncomingMessage();
    req.headers = {};
    req.method = "GET";
    req.url = "/" + additionalScriptPathname;
    var nextCalled = false;
    WebAppInternals.staticFilesMiddleware(
      staticFilesOpts, req, res, function () {
        nextCalled = true;
      });
    test.isTrue(nextCalled);
  });

  // When inline scripts are disallowed, the script body should not be
  // inlined, and the script should be included in a <script src="..">
  // tag.
  WebAppInternals.setInlineScriptsAllowed(false);

  Meteor._noYieldsAllowed(function () {
    var boilerplate = WebAppInternals.getBoilerplate({
      browser: "doesn't-matter",
      url: "also-doesnt-matter"
    }, "web.browser");

    // The script contents itself should not be present; the pathname
    // where the script is served should be.
    test.isTrue(boilerplate.indexOf(additionalScript) === -1);
    test.isTrue(boilerplate.indexOf(additionalScriptPathname) !== -1);

    // And the static file handler should serve the script at that pathname.
    var res = new MockResponse();
    var req = new http.IncomingMessage();
    req.headers = {};
    req.method = "GET";
    req.url = "/" + additionalScriptPathname;
    WebAppInternals.staticFilesMiddleware(staticFilesOpts, req, res,
                                     function () { });
    var resBody = res.getBody();
    test.isTrue(resBody.indexOf(additionalScript) !== -1);
    test.equal(res.statusCode, 200);
  });

  WebAppInternals.setInlineScriptsAllowed(origInlineScriptsAllowed);
});

// Regression test: `generateBoilerplateInstance` should not change
// `__meteor_runtime_config__`.
Tinytest.add("webapp - generating boilerplate should not change runtime config", function (test) {
  // Set a dummy key in the runtime config served in the
  // boilerplate. Test that the dummy key appears in the boilerplate,
  // but not in __meteor_runtime_config__ after generating the
  // boilerplate.

  test.isFalse(__meteor_runtime_config__.WEBAPP_TEST_KEY);

  var boilerplate = WebAppInternals.generateBoilerplateInstance(
    "web.browser",
    {}, // empty manifest
    { runtimeConfigOverrides: { WEBAPP_TEST_KEY: true } }
  );

  var boilerplateHtml = boilerplate.toHTML();
  test.isFalse(boilerplateHtml.indexOf("WEBAPP_TEST_KEY") === -1);

  test.isFalse(__meteor_runtime_config__.WEBAPP_TEST_KEY);
});

__meteor_runtime_config__.WEBAPP_TEST_A = '<p>foo</p>';
__meteor_runtime_config__.WEBAPP_TEST_B = '</script>';


Tinytest.add("webapp - npm modules", function (test) {
  // Make sure the version number looks like a version number.
  test.matches(WebAppInternals.NpmModules.connect.version, /^2\.(\d+)\.(\d+)/);
  test.equal(typeof(WebAppInternals.NpmModules.connect.module), 'function');
  test.equal(typeof(WebAppInternals.NpmModules.connect.module.basicAuth),
             'function');
});
