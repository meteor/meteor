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

  var boilerplate = WebAppInternals.getBoilerplate({
    browser: "doesn't-matter",
    url: "also-doesnt-matter"
  });

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
  WebAppInternals.serveStaticFiles(staticFilesOpts, req, res, function () {
    nextCalled = true;
  });
  test.isTrue(nextCalled);

  // When inline scripts are disallowed, the script body should not be
  // inlined, and the script should be included in a <script src="..">
  // tag.
  WebAppInternals.setInlineScriptsAllowed(false);
  boilerplate = WebAppInternals.getBoilerplate({
    browser: "doesn't-matter",
    url: "also-doesnt-matter"
  });

  // The script contents itself should not be present; the pathname
  // where the script is served should be.
  test.isTrue(boilerplate.indexOf(additionalScript) === -1);
  test.isTrue(boilerplate.indexOf(additionalScriptPathname) !== -1);

  // And the static file handler should serve the script at that pathname.
  res = new MockResponse();
  WebAppInternals.serveStaticFiles(staticFilesOpts, req, res, function () { });
  var resBody = res.getBody();
  test.isTrue(resBody.indexOf(additionalScript) !== -1);
  test.equal(res.statusCode, 200);

  WebAppInternals.setInlineScriptsAllowed(origInlineScriptsAllowed);
});
