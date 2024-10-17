import { WebApp, WebAppInternals } from './webapp_server';

const url = require("url");
const crypto = require("crypto");
const http = require("http");
const streamToString = require("stream-to-string");
import { isModern } from "meteor/modern-browsers";

const additionalScript = "(function () { var foo = 1; })";
WebAppInternals.addStaticJs(additionalScript);
const hash = crypto.createHash('sha1');
hash.update(additionalScript);
const additionalScriptPathname = hash.digest('hex') + ".js";

// Mock the 'res' object that gets passed to connect handlers. This mock
// just records any utf8 data written to the response and returns it
// when you call `mockResponse.getBody()`.
const MockResponse = function () {
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
const asyncGet =
  (url, opt) =>
    new Promise((resolve, reject) =>
      HTTP.get(url, opt, (err, res) =>
        err
          ? reject(err)
          : resolve(res)
      ));
Tinytest.addAsync("webapp - content-type header", async function (test) {
  const staticFiles = WebAppInternals.staticFilesByArch["web.browser"];
  const staticFilesKeys = Object.keys(staticFiles);

  const cssResource = staticFilesKeys.find(
    function (url) {
      return staticFiles[url].type === "css";
    }
  );

  const jsResource = staticFilesKeys.find(
    function (url) {
      return staticFiles[url].type === "js";
    }
  );
  let resp = await asyncGet(url.resolve(Meteor.absoluteUrl(), cssResource));
  test.equal(resp.headers["content-type"].toLowerCase(),
             "text/css; charset=utf-8");
  resp = await asyncGet(url.resolve(Meteor.absoluteUrl(), jsResource));
  test.equal(resp.headers["content-type"].toLowerCase(),
             "application/javascript; charset=utf-8");
});

const modernUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/68.0.3440.15 Safari/537.36";

const legacyUserAgent = "legacy";

Tinytest.addAsync("webapp - modern/legacy static files", test => {
  test.equal(isModern(WebAppInternals.identifyBrowser(modernUserAgent)), true);
  test.equal(isModern(WebAppInternals.identifyBrowser(legacyUserAgent)), false);

  const promises = [];

  Object.keys(WebAppInternals.staticFilesByArch).forEach(arch => {
    const staticFiles = WebAppInternals.staticFilesByArch[arch];

    Object.keys(staticFiles).forEach(path => {
      const { type } = staticFiles[path];
      if (type !== "asset") {
        return;
      }

      const pathMatch = /\/(modern|legacy)_test_asset\.js$/.exec(path);
      if (! pathMatch) {
        return;
      }

      const absUrl = url.resolve(Meteor.absoluteUrl(), path);

      [ // Try to request the modern/legacy assets with both modern and
        // legacy User Agent strings. (#9953)
        modernUserAgent,
        legacyUserAgent,
      ].forEach(ua => promises.push(new Promise((resolve, reject) => {
        HTTP.get(absUrl, {
          headers: {
            "User-Agent": ua
          }
        }, (error, response) => {
          if (error) {
            reject(error);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Bad status code ${
              response.statusCode
            } for ${path}`));
            return;
          }

          const contentType = response.headers["content-type"];
          if (! contentType.startsWith("application/javascript")) {
            reject(new Error(`Bad Content-Type ${contentType} for ${path}`));
            return;
          }

          const expectedText = pathMatch[1].toUpperCase();
          const index = response.content.indexOf(expectedText);
          if (index < 0) {
            reject(new Error(`Missing ${
              JSON.stringify(expectedText)
            } text in ${path}`));
            return;
          }

          resolve(path);
        });
      })));
    });
  });

  test.isTrue(promises.length > 0);

  return Promise.all(promises);
});

Tinytest.addAsync(
  "webapp - additional static javascript",
  async function (test) {
    const origInlineScriptsAllowed = WebAppInternals.inlineScriptsAllowed();

    const staticFilesOpts = {
      staticFiles: {},
      clientDir: "/"
    };

    // It's okay to set this global state because we're not going to yield
    // before setting it back to what it was originally.
    await WebAppInternals.setInlineScriptsAllowed(true);

    {
      const { stream } = await WebAppInternals.getBoilerplate({
        browser: "doesn't-matter",
        url: "also-doesnt-matter"
      }, "web.browser");

      const boilerplate = await streamToString(stream);

      // When inline scripts are allowed, the script should be inlined.
      test.isTrue(boilerplate.indexOf(additionalScript) !== -1);

      // And the script should not be served as its own separate resource,
      // meaning that the static file handler should pass on this request.
      const res = new MockResponse();
      const req = new http.IncomingMessage();
      req.headers = {};
      req.method = "GET";
      req.url = "/" + additionalScriptPathname;
      let nextCalled = false;
      await WebAppInternals.staticFilesMiddleware({
        "web.browser": {},
        "web.browser.legacy": {},
      }, req, res, function () {
        nextCalled = true;
      });
      test.isTrue(nextCalled);

      // When inline scripts are disallowed, the script body should not be
      // inlined, and the script should be included in a <script src="..">
      // tag.
      await WebAppInternals.setInlineScriptsAllowed(false);
    }

    {
      const { stream }  = await WebAppInternals.getBoilerplate({
        browser: "doesn't-matter",
        url: "also-doesnt-matter"
      }, "web.browser");
      const boilerplate = await streamToString(stream);

      // The script contents itself should not be present; the pathname
      // where the script is served should be.
      test.isTrue(boilerplate.indexOf(additionalScript) === -1);
      test.isTrue(boilerplate.indexOf(additionalScriptPathname) !== -1);
    }

    // And the static file handler should serve the script at that pathname.
    const res = new MockResponse();
    const req = new http.IncomingMessage();
    req.headers = {};
    req.method = "GET";
    req.url = "/" + additionalScriptPathname;
    await WebAppInternals.staticFilesMiddleware({
      "web.browser": {},
      "web.browser.legacy": {},
    }, req, res, function () {});
    const resBody = res.getBody();
    test.isTrue(resBody.indexOf(additionalScript) !== -1);
    test.equal(res.statusCode, 200);

    await WebAppInternals.setInlineScriptsAllowed(origInlineScriptsAllowed);
  }
);

// Regression test: `generateBoilerplateInstance` should not change
// `__meteor_runtime_config__`.
Tinytest.addAsync(
  "webapp - generating boilerplate should not change runtime config",
  async function (test) {
    // Set a dummy key in the runtime config served in the
    // boilerplate. Test that the dummy key appears in the boilerplate,
    // but not in __meteor_runtime_config__ after generating the
    // boilerplate.

    test.isFalse(__meteor_runtime_config__.WEBAPP_TEST_KEY);

    const boilerplate = WebAppInternals.generateBoilerplateInstance(
      "web.browser",
      [], // empty manifest
      { runtimeConfigOverrides: { WEBAPP_TEST_KEY: true } }
    );

    const stream = boilerplate.toHTMLStream();
    const boilerplateHtml = await streamToString(stream)
    test.isFalse(boilerplateHtml.indexOf("WEBAPP_TEST_KEY") === -1);

    test.isFalse(__meteor_runtime_config__.WEBAPP_TEST_KEY);
  }
);

Tinytest.addAsync(
  "webapp - WebAppInternals.registerBoilerplateDataCallback",
  async function (test) {
    const key = "from webapp_tests.js";
    let callCount = 0;

    function callback(request, data, arch) {
      test.equal(arch, "web.browser");
      test.equal(request.url, "http://example.com");
      test.equal(data.dynamicHead.indexOf("so dynamic"), 0);
      test.equal(data.body, "");
      data.body = "<div>oyez</div>";
      ++callCount;
    }

    WebAppInternals.registerBoilerplateDataCallback(key, callback);

    test.equal(callCount, 0);

    const req = new http.IncomingMessage();
    req.url = "http://example.com";
    req.browser = { name: "headless" };
    req.dynamicHead = "so dynamic";

    const { stream } = await WebAppInternals.getBoilerplate(req, "web.browser");
    const html = await streamToString(stream);

    test.equal(callCount, 1);

    test.isTrue(html.indexOf([
      "<body>",
      "<div>oyez</div>"
    ].join("")) >= 0);

    test.equal(
      // Make sure this callback doesn't get called again after this test.
      WebAppInternals.registerBoilerplateDataCallback(key, null),
      callback
    );
  }
);

// Support 'named pipes' (strings) as ports for support of Windows Server /
// Azure deployments
Tinytest.add(
  "webapp - port should be parsed as int unless it is a named pipe",
  function (test) {
    // Named pipes on Windows Server follow the format:
    // \\.\pipe\{randomstring} or \\{servername}\pipe\{randomstring}
    const namedPipe = "\\\\.\\pipe\\b27429e9-61e3-4c12-8bfe-950fa3295f74";
    const namedPipeServer =
      "\\\\SERVERNAME-1234\\pipe\\6e157e98-faef-49e4-a0cf-241037223308";

    test.equal(
      WebAppInternals.parsePort(namedPipe),
      "\\\\.\\pipe\\b27429e9-61e3-4c12-8bfe-950fa3295f74"
    );
    test.equal(
      WebAppInternals.parsePort(namedPipeServer),
      "\\\\SERVERNAME-1234\\pipe\\6e157e98-faef-49e4-a0cf-241037223308"
    );
    test.equal(
      WebAppInternals.parsePort(8080),
      8080
    );
    test.equal(
      WebAppInternals.parsePort("8080"),
      8080
    );
    // Ensure strangely formatted ports still work for backwards compatibility
    test.equal(
      WebAppInternals.parsePort("8080abc"),
      8080
    );
  }
);

__meteor_runtime_config__.WEBAPP_TEST_A = '<p>foo</p>';
__meteor_runtime_config__.WEBAPP_TEST_B = '</script>';


Tinytest.add("webapp - npm modules", function (test) {
  // Make sure the version number looks like a version number.
  test.matches(WebAppInternals.NpmModules.express.version, /^4\.(\d+)\.(\d+)/);
  test.equal(typeof(WebAppInternals.NpmModules.express.module), 'function');
});

Tinytest.addAsync(
  "webapp - addRuntimeConfigHook usage",
  async function (test, done) {
    WebApp.addRuntimeConfigHook(async (config) => {
      const nextConfig = {
        ...WebApp.decodeRuntimeConfig(config.encodedCurrentConfig),
        customKey: 'customValue',
      };
      return WebApp.encodeRuntimeConfig(nextConfig);
    });

    const req = new http.IncomingMessage();
    req.url = 'http://example.com';
    req.browser = { name: 'headless' };
    const boilerplate = await WebAppInternals.getBoilerplate(req, 'web.browser');
    const html = await streamToString(boilerplate.stream);
    test.isTrue(/__meteor_runtime_config__ = (.*customKey[^"].*customValue.*)/.test(html));
  }
);
