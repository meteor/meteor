var fs = Npm.require('fs');
var child_process = Npm.require('child_process');
var querystring = Npm.require('querystring');
var urlParser = Npm.require('url');

// list of bot user agents that we want to serve statically, but do
// not obey the _escaped_fragment_ protocol. The page is served
// statically to any client whos user agent matches any of these
// regexps. Users may modify this array.
//
// An original goal with the spiderable package was to avoid doing
// user-agent based tests. But the reality is not enough bots support
// the _escaped_fragment_ protocol, so we need to hardcode a list
// here. I shed a silent tear.
Spiderable.userAgentRegExps = [
  /^facebookexternalhit/i,
  /^Facebot/,
  /^linkedinbot/i,
  /^twitterbot/i,
  /^slackbot-linkexpanding/i
];

// how long to let phantomjs run before we kill it (and send down the
// regular page instead). Users may modify this number.
Spiderable.requestTimeoutMs = 15*1000;
Spiderable.maxConcurrentRequests = 2;
Spiderable.maxQueuedRequests = 8;
Spiderable.queueTimeoutMs = 5*1000;
// maximum size of result HTML. node's default is 200k which is too
// small for our docs.
var MAX_BUFFER = 5*1024*1024; // 5MB

Spiderable._createRendererScheduler = function (config) {
  var active = 0;
  var queue = [];

  var readInteger = function (getter, fallback, minimum) {
    var value = getter();
    return Number.isInteger(value) && value >= minimum ? value : fallback;
  };

  var start = function (entry) {
    entry.state = "started";
    if (entry.timer) Meteor.clearTimeout(entry.timer);
    if (entry.onStart) entry.onStart();
    active += 1;
    Promise.resolve()
      .then(entry.task)
      .catch(function (error) {
        if (entry.onError) entry.onError(error);
        else Meteor._debug("spiderable: renderer task failed:", error);
      })
      .then(function () {
        active -= 1;
        drain();
      });
  };

  var drain = function () {
    var maxConcurrent = readInteger(config.maxConcurrent, 2, 1);
    while (active < maxConcurrent && queue.length > 0) {
      start(queue.shift());
    }
  };

  return {
    schedule: function (task, onRejected, onStart, onError) {
      var maxConcurrent = readInteger(config.maxConcurrent, 2, 1);
      var maxQueued = readInteger(config.maxQueued, 8, 0);
      var entry = {
        task: task,
        onRejected: onRejected,
        onStart: onStart,
        onError: onError,
        state: "new",
        timer: null
      };

      entry.cancel = function () {
        if (entry.state !== "queued") return false;
        var index = queue.indexOf(entry);
        if (index !== -1) queue.splice(index, 1);
        if (entry.timer) Meteor.clearTimeout(entry.timer);
        entry.state = "cancelled";
        return true;
      };

      if (active < maxConcurrent) {
        start(entry);
      } else if (queue.length >= maxQueued) {
        entry.state = "rejected";
        onRejected("queue_full");
      } else {
        entry.state = "queued";
        queue.push(entry);
        var timeout = readInteger(config.queueTimeoutMs, 5000, 1);
        entry.timer = Meteor.setTimeout(function () {
          if (!entry.cancel()) return;
          onRejected("queue_timeout");
        }, timeout);
      }

      return entry;
    },
    stats: function () {
      return { active: active, queued: queue.length };
    }
  };
};

var rendererScheduler = Spiderable._createRendererScheduler({
  maxConcurrent: function () { return Spiderable.maxConcurrentRequests; },
  maxQueued: function () { return Spiderable.maxQueuedRequests; },
  queueTimeoutMs: function () { return Spiderable.queueTimeoutMs; }
});
var phantomScriptPromise = Assets.getTextAsync("phantom_script.js");

// Exported for tests.
Spiderable._urlForPhantom = function (siteAbsoluteUrl, requestUrl) {
  // reassembling url without escaped fragment if exists
  var parsedUrl = urlParser.parse(requestUrl);
  var parsedQuery = querystring.parse(parsedUrl.query);
  var escapedFragment = parsedQuery['_escaped_fragment_'];
  delete parsedQuery['_escaped_fragment_'];

  var parsedAbsoluteUrl = urlParser.parse(siteAbsoluteUrl);
  // If the ROOT_URL contains a path, Meteor strips that path off of the
  // request's URL before we see it. So we concatenate the pathname from
  // the request's URL with the root URL's pathname to get the full
  // pathname.
  if (parsedUrl.pathname.charAt(0) === "/") {
    parsedUrl.pathname = parsedUrl.pathname.substring(1);
  }
  parsedAbsoluteUrl.pathname = urlParser.resolve(parsedAbsoluteUrl.pathname,
                                                 parsedUrl.pathname);
  parsedAbsoluteUrl.query = parsedQuery;
  // `url.format` will only use `query` if `search` is absent
  parsedAbsoluteUrl.search = null;

  if (escapedFragment !== undefined && escapedFragment !== null && escapedFragment.length > 0) {
    parsedAbsoluteUrl.hash = '!' + decodeURIComponent(escapedFragment);
  }

  return urlParser.format(parsedAbsoluteUrl);
};

WebApp.handlers.use(function (req, res, next) {
  // _escaped_fragment_ comes from Google's AJAX crawling spec:
  // https://developers.google.com/webmasters/ajax-crawling/docs/specification
  if (/\?.*_escaped_fragment_=/.test(req.url) ||
      _.any(Spiderable.userAgentRegExps, function (re) {
        return re.test(req.headers['user-agent']); })) {

    var removeQueueListeners = function () {
      req.removeListener("aborted", cancelQueuedRequest);
      res.removeListener("close", cancelQueuedRequest);
    };
    var ticket;
    var cancelQueuedRequest = function () {
      if (ticket && ticket.cancel()) removeQueueListeners();
    };
    var rejectRequest = function () {
      removeQueueListeners();
      if (!res.destroyed && !res.writableEnded) next();
    };

    ticket = rendererScheduler.schedule(async function () {
      var url = Spiderable._urlForPhantom(Meteor.absoluteUrl(), req.url);
      var PHANTOM_SCRIPT;
      try {
        PHANTOM_SCRIPT = await phantomScriptPromise;
      } catch (error) {
        Meteor._debug("spiderable: could not load phantom script:", error);
        if (!res.destroyed && !res.writableEnded) next();
        return;
      }
      if (req.aborted || res.destroyed || res.writableEnded) return;

      // This string is going to be put into a bash script, so it's important
      // that 'url' (which comes from the network) can neither exploit phantomjs
      // or the bash script. JSON stringification should prevent it from
      // exploiting phantomjs, and since the output of JSON.stringify shouldn't
      // be able to contain newlines, it should be unable to exploit bash as
      // well.
      var phantomScript = "var url = " + JSON.stringify(url) + ";" +
            PHANTOM_SCRIPT;

      // Allow override of phantomjs args via env var
      // We use one env var to try to keep env-var explosion under control.
      // We're not going to document this unless it is actually needed;
      // (if you find yourself needing this please let us know the use case!)
      var phantomJsArgs = process.env.METEOR_PKG_SPIDERABLE_PHANTOMJS_ARGS || '';

      // Default image loading to off (we don't need images)
      if (phantomJsArgs.indexOf("--load-images=") === -1) {
        phantomJsArgs += " --load-images=no";
      }

      // POODLE means SSLv3 is being turned off everywhere.
      // phantomjs currently defaults to SSLv3, and won't use TLS.
      // Use --ssl-protocol to set the default to TLSv1
      // (another option would be 'any', but really, we want to say >= TLSv1)
      // More info: https://groups.google.com/forum/#!topic/meteor-core/uZhT3AHwpsI
      if (phantomJsArgs.indexOf("--ssl-protocol=") === -1) {
        phantomJsArgs += " --ssl-protocol=TLSv1";
      }

      await new Promise(function (resolve) {
        var child;
        var finished = false;
        var killTimer;
        var timeoutKillTimer;
        var cleanup = function () {
          req.removeListener("aborted", abort);
          res.removeListener("close", abort);
          if (killTimer) Meteor.clearTimeout(killTimer);
          if (timeoutKillTimer) Meteor.clearTimeout(timeoutKillTimer);
        };
        var finish = function () {
          if (finished) return false;
          finished = true;
          cleanup();
          resolve();
          return true;
        };
        var abort = function () {
          if (!child) {
            finish();
            return;
          }
          child.kill();
          killTimer = Meteor.setTimeout(function () {
            if (!finished) child.kill("SIGKILL");
          }, 1000);
        };
        req.once("aborted", abort);
        res.once("close", abort);
        if (req.aborted || res.destroyed || res.writableEnded) {
          abort();
          return;
        }

        // Run phantomjs. The shell uses exec so killing this child also kills
        // the renderer rather than leaving a descendant behind.
        var requestTimeoutMs = Spiderable.requestTimeoutMs;
        try {
          child = child_process.execFile(
            '/usr/bin/env',
            ['bash', '-c',
             ("exec phantomjs " + phantomJsArgs + " /dev/stdin <<'END'\n" +
              phantomScript + "END\n")],
            {timeout: requestTimeoutMs, maxBuffer: MAX_BUFFER},
            function (error, stdout, stderr) {
              if (!finish()) return;
              if (req.aborted || res.destroyed || res.writableEnded) return;
              if (!error && /<html/i.test(stdout)) {
                res.writeHead(200, {'Content-Type': 'text/html; charset=UTF-8'});
                res.end(stdout);
              } else {
                // phantomjs failed. Don't send the error, instead send the
                // normal page.
                if (error && error.code === 127)
                  Meteor._debug("spiderable: phantomjs not installed. Download and install from http://phantomjs.org/");
                else
                  Meteor._debug("spiderable: phantomjs failed at " + url + ":", error, "\nstderr:", stderr, "\nstdout:", stdout);

                next();
              }
            });
          // execFile only sends SIGTERM when the timeout expires. Follow up with
          // SIGKILL so a renderer that ignores it cannot keep its slot forever.
          if (requestTimeoutMs > 0) {
            timeoutKillTimer = Meteor.setTimeout(function () {
              if (!finished) child.kill("SIGKILL");
            }, requestTimeoutMs + 1000);
          }
        } catch (error) {
          if (!finish()) return;
          Meteor._debug("spiderable: phantomjs could not start:", error);
          next();
        }
      });
    }, rejectRequest, removeQueueListeners, function (error) {
      Meteor._debug("spiderable: renderer task failed:", error);
      if (!res.destroyed && !res.writableEnded) next();
    });

    if (ticket.state === "queued") {
      req.once("aborted", cancelQueuedRequest);
      res.once("close", cancelQueuedRequest);
    }
  } else {
    next();
  }
});
