var url = Npm.require("url");

Tinytest.add("spiderable - phantom url generation", function (test, expect) {
  var absUrl = "http://example.com";
  _.each([
    // Requests resulting from `<meta name="fragment" content="!">`
    // will have an `_escaped_fragment_` which is present but blank,
    // which we want to represent as having no hash fragment
    // parameter.  (Note this means we cannot distinguish between `/`
    // and `/#!`).
    {
      requestUrl: "/?_escaped_fragment_=",
      expected: "/"
    },
    // Test that a nonempty fragment is tunneled through to the generated URL
    {
      requestUrl: "/?_escaped_fragment_=1",
      expected: "/#!1"
    },
    // Test decoding the encoded escaped fragment.
    {
      requestUrl: "/?_escaped_fragment_=abc%3D123%26def%3D456",
      expected: "/#!abc=123&def=456"
    },
    // Test that query strings are preserved
    {
      requestUrl: "/?_escaped_fragment_=1&foo=bar",
      expected: "/?foo=bar#!1"
    },
    {
      requestUrl: "/?foo=bar&_escaped_fragment_=1",
      expected: "/?foo=bar#!1"
    },
    // Test that paths are preserved
    {
      requestUrl: "/foo/bar?_escaped_fragment_=1",
      expected: "/foo/bar#!1"
    },
    {
      requestUrl: "/foo/bar?_escaped_fragment_=1&foo=bar",
      expected: "/foo/bar?foo=bar#!1"
    },
    // Test with a path on the site's absolute url
    {
      requestUrl: "/foo/bar?_escaped_fragment_=1",
      expected: "/foo/bar#!1",
      absUrl: "http://example.com/foo"
    },
    {
      requestUrl: "/bar?_escaped_fragment_=1",
      expected: "/bar#!1",
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

Tinytest.addAsync("spiderable - renderer scheduler bounds work", async function (test) {
  var active = 0;
  var peak = 0;
  var started = [];
  var rejected = [];
  var releases = [];
  var scheduler = Spiderable._createRendererScheduler({
    maxConcurrent: function () { return 1; },
    maxQueued: function () { return 1; },
    queueTimeoutMs: function () { return 1000; }
  });
  var task = function (name) {
    return async function () {
      started.push(name);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(function (resolve) { releases.push(resolve); });
      active -= 1;
    };
  };

  scheduler.schedule(task("first"), function (reason) { rejected.push(reason); });
  scheduler.schedule(task("second"), function (reason) { rejected.push(reason); });
  scheduler.schedule(task("third"), function (reason) { rejected.push(reason); });
  await Promise.resolve();

  test.equal(started, ["first"]);
  test.equal(rejected, ["queue_full"]);
  test.equal(scheduler.stats(), { active: 1, queued: 1 });

  releases.shift()();
  while (started.length < 2) {
    await new Promise(function (resolve) { Meteor.setTimeout(resolve, 0); });
  }
  test.equal(started, ["first", "second"]);
  test.equal(peak, 1);
  releases.shift()();
  await new Promise(function (resolve) { Meteor.setTimeout(resolve, 0); });
  test.equal(scheduler.stats(), { active: 0, queued: 0 });
});

Tinytest.addAsync("spiderable - renderer scheduler times out and cancels queued work", async function (test) {
  var releaseActive;
  var timedOutReason;
  var queuedTaskRan = false;
  var scheduler = Spiderable._createRendererScheduler({
    maxConcurrent: function () { return 1; },
    maxQueued: function () { return 2; },
    queueTimeoutMs: function () { return 20; }
  });

  scheduler.schedule(async function () {
    await new Promise(function (resolve) { releaseActive = resolve; });
  }, function () {});
  scheduler.schedule(async function () {
    queuedTaskRan = true;
  }, function (reason) {
    timedOutReason = reason;
  });
  var cancelled = scheduler.schedule(async function () {
    queuedTaskRan = true;
  }, function () {});
  cancelled.cancel();

  await new Promise(function (resolve) { Meteor.setTimeout(resolve, 50); });
  test.equal(timedOutReason, "queue_timeout");
  test.isFalse(queuedTaskRan);
  test.equal(scheduler.stats(), { active: 1, queued: 0 });

  releaseActive();
  await new Promise(function (resolve) { Meteor.setTimeout(resolve, 0); });
  test.equal(scheduler.stats(), { active: 0, queued: 0 });
});

Tinytest.addAsync("spiderable - renderer scheduler reports task errors", async function (test) {
  var reported;
  var scheduler = Spiderable._createRendererScheduler({
    maxConcurrent: function () { return 1; },
    maxQueued: function () { return 0; },
    queueTimeoutMs: function () { return 1000; }
  });

  scheduler.schedule(async function () {
    throw new Error("malformed renderer request");
  }, function () {}, function () {}, function (error) {
    reported = error;
  });

  while (!reported) {
    await new Promise(function (resolve) { Meteor.setTimeout(resolve, 0); });
  }
  await Promise.resolve();
  test.equal(reported.message, "malformed renderer request");
  test.equal(scheduler.stats(), { active: 0, queued: 0 });
});

// A PATH stub records PhantomJS processes while requests use the real handler.
var fs = Npm.require("fs");
var os = Npm.require("os");
var path = Npm.require("path");
var http = Npm.require("http");

var sleep = function (ms) {
  return new Promise(function (resolve) { Meteor.setTimeout(resolve, ms); });
};

var waitFor = async function (condition, timeoutMs) {
  var deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await sleep(20);
  return condition();
};

var RENDERED = "<html><body>rendered by stub</body></html>";

var withFakePhantom = async function (settings, fn) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "spiderable-test-"));
  var startedDir = path.join(dir, "started");
  var modeFile = path.join(dir, "mode");
  fs.mkdirSync(startedDir);
  fs.writeFileSync(path.join(dir, "phantomjs"), [
    "#!/bin/sh",
    'echo $$ > "' + startedDir + '/$$"',
    'case "$(cat "' + modeFile + '")" in',
    '  render) echo "' + RENDERED + '" ;;',
    "  crash) exit 3 ;;",
    "  hang) exec sleep 600 ;;",
    "  ignore-term) trap '' TERM; while :; do sleep 1; done ;;",
    "esac",
    ""
  ].join("\n"), { mode: 0o755 });

  var startedPids = function () {
    return fs.readdirSync(startedDir).map(Number);
  };
  var isAlive = function (pid) {
    try { process.kill(pid, 0); return true; } catch (e) { return false; }
  };
  var saved = { PATH: process.env.PATH };
  _.each(settings, function (value, key) {
    saved[key] = Spiderable[key];
    Spiderable[key] = value;
  });
  process.env.PATH = dir + path.delimiter + process.env.PATH;
  try {
    await fn({
      setMode: function (mode) { fs.writeFileSync(modeFile, mode); },
      started: function () { return startedPids().length; },
      live: function () { return _.filter(startedPids(), isAlive).length; }
    });
  } finally {
    process.env.PATH = saved.PATH;
    _.each(settings, function (value, key) { Spiderable[key] = saved[key]; });
    _.each(startedPids(), function (pid) {
      try { process.kill(pid, "SIGKILL"); } catch (e) {}
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

var crawlerRequest = function (pathname) {
  var result = { done: false };
  result.req = http.get({
    host: "127.0.0.1",
    port: process.env.PORT,
    path: pathname,
    agent: false,
    headers: { "user-agent": "facebookexternalhit/1.1" }
  }, function (res) {
    var body = "";
    res.setEncoding("utf8");
    res.on("data", function (chunk) { body += chunk; });
    res.on("end", function () {
      result.status = res.statusCode;
      result.body = body;
      result.done = true;
    });
  });
  result.req.on("error", function () {});
  return result;
};

var isNormalPage = function (result) {
  return result.done && result.status === 200 &&
    result.body.indexOf("__meteor_runtime_config__") !== -1;
};

Tinytest.addAsync("spiderable - crawler flood starts a bounded number of renderers", async function (test) {
  await withFakePhantom({
    maxConcurrentRequests: 2,
    maxQueuedRequests: 2,
    queueTimeoutMs: 30 * 1000,
    requestTimeoutMs: 30 * 1000
  }, async function (phantom) {
    phantom.setMode("hang");
    var requests = _.times(8, function (i) {
      return crawlerRequest("/spiderable-flood-" + i);
    });
    var answered = function () { return _.filter(requests, function (r) { return r.done; }); };

    await waitFor(function () {
      return phantom.started() >= 2 && answered().length >= 4;
    }, 5000);
    await sleep(300);
    test.equal(phantom.started(), 2);
    test.equal(answered().length, 4);
    _.each(answered(), function (r) {
      test.isTrue(isNormalPage(r), "rejected crawler request gets the normal page");
    });

    _.each(requests, function (r) { r.req.destroy(); });
    test.isTrue(await waitFor(function () { return phantom.live() === 0; }, 5000),
                "renderers stopped after clients disconnected");
    phantom.setMode("render");
    var next = crawlerRequest("/spiderable-after-flood");
    await waitFor(function () { return next.done; }, 5000);
    test.equal(next.body && next.body.trim(), RENDERED);
  });
});

Tinytest.addAsync("spiderable - failed renders fall back to the normal page and free their slot", async function (test) {
  await withFakePhantom({
    maxConcurrentRequests: 1,
    maxQueuedRequests: 0,
    requestTimeoutMs: 300
  }, async function (phantom) {
    var failThenRender = async function (mode) {
      phantom.setMode(mode);
      var failed = crawlerRequest("/spiderable-" + mode);
      await waitFor(function () { return failed.done; }, 5000);
      test.isTrue(isNormalPage(failed), mode + ": normal page");
      failed.req.destroy();

      phantom.setMode("render");
      var rendered = crawlerRequest("/spiderable-" + mode + "-next");
      await waitFor(function () { return rendered.done; }, 5000);
      test.equal(rendered.body && rendered.body.trim(), RENDERED, mode + ": slot freed");
    };
    await failThenRender("hang");
    await failThenRender("ignore-term");
    await failThenRender("crash");
  });
});

Tinytest.addAsync("spiderable - renderer spawn errors fall back to the normal page and free their slot", async function (test) {
  var child_process = Npm.require("child_process");
  var execFile = child_process.execFile;
  await withFakePhantom({
    maxConcurrentRequests: 1,
    maxQueuedRequests: 0
  }, async function (phantom) {
    var failThenRender = async function (label, failingExecFile) {
      child_process.execFile = failingExecFile;
      try {
        var failed = crawlerRequest("/spiderable-" + label);
        await waitFor(function () { return failed.done; }, 5000);
        test.isTrue(isNormalPage(failed), label + ": normal page");
      } finally {
        child_process.execFile = execFile;
      }
      var rendered = crawlerRequest("/spiderable-" + label + "-next");
      await waitFor(function () { return rendered.done; }, 5000);
      test.equal(rendered.body && rendered.body.trim(), RENDERED, label + ": slot freed");
    };
    phantom.setMode("render");
    await failThenRender("error-event", function (file, args, options, callback) {
      return execFile.call(this, "/nonexistent/spiderable-test-env", args, options, callback);
    });
    await failThenRender("spawn-throws", function () {
      throw new Error("synthetic spawn failure");
    });
  });
});

Tinytest.addAsync("spiderable - queued crawler requests get the normal page after queueTimeoutMs", async function (test) {
  await withFakePhantom({
    maxConcurrentRequests: 1,
    maxQueuedRequests: 1,
    queueTimeoutMs: 200,
    requestTimeoutMs: 30 * 1000
  }, async function (phantom) {
    phantom.setMode("hang");
    var active = crawlerRequest("/spiderable-active");
    await waitFor(function () { return phantom.started() === 1; }, 5000);
    var queued = crawlerRequest("/spiderable-queued");
    await waitFor(function () { return queued.done; }, 5000);
    test.isTrue(isNormalPage(queued), "timed out queued request gets the normal page");
    test.equal(phantom.started(), 1);
    active.req.destroy();
    test.isTrue(await waitFor(function () { return phantom.live() === 0; }, 5000));
  });
});
