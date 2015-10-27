///
/// utility functions for dealing with urls and http
///

var os = require('os');
var util = require('util');

var _ = require('underscore');
var Future = require('fibers/future');

var files = require('../fs/files.js');
var auth = require('../meteor-services/auth.js');
var config = require('../meteor-services/config.js');
var release = require('../packaging/release.js');
var Console = require('../console/console.js').Console;


// Helper that tracks bytes written to a writable
var WritableWithProgress = function (writable, listener) {
  var self = this;
  self._inner = writable;
  self._listener = listener;
};

_.extend(WritableWithProgress.prototype, {
  write: function (chunk, encoding, callback) {
    var self = this;
    self._listener(chunk.length, false);
    return self._inner.write(chunk, encoding);
  },

  end: function (chunk, encoding, callback) {
    var self = this;
    self._listener(chunk ? chunk.length : 0, true);
    return self._inner.end(chunk, encoding);
  },

  _progress: function (n, done) {
    var self = this;

    var state = self._state;
    state.current += n;
    if (done) {
      state.current.done = true;
    }
    self.progress.reportProgress(state);
  },

  on: function (name, callback) {
    return this._inner.on(name, callback);
  },

  once: function () {
    return this._inner.once(...arguments);
  },

  emit: function () {
    return this._inner.emit(...arguments);
  }
});


// Compose a User-Agent header.
var getUserAgent = function () {
  var version;

  if (release.current)
    version = release.current.isCheckout() ? 'checkout' : release.current.name;
  else
    // This happens when we haven't finished starting up yet (say, the
    // user passed --release 1.2.3 and we have to download 1.2.3
    // before we can get going), or if we are using an installed copy
    // of Meteor to 'meteor update'ing a project that was created by a
    // checkout and doesn't have a version yet.
    version = files.inCheckout() ? 'checkout' : files.getToolsVersion();

  return util.format('Meteor/%s OS/%s (%s; %s; %s;)', version,
                     os.platform(), os.type(), os.release(), os.arch());
};


var httpHelpers = exports;
_.extend(exports, {
  getUserAgent: getUserAgent,

  // A wrapper around request with the following improvements:
  //
  // - It will respect proxy environment variables if present
  //   (HTTP_PROXY or HTTPS_PROXY as appropriate).
  //
  // - It will set a reasonable User-Agent header.
  //
  // - If you omit the callback it will run synchronously. The return
  //   value will be an object with keys 'response' and 'body' (with
  //   the same meaning as the arguments to request's normal
  //   callback), or it will throw.
  //
  // - If Set-Cookie headers are present on the response, *and* you
  //   are using a callback, it will parse the cookies and include
  //   them as a setCookie attribute on the object passed to the
  //   callback. setCookie is a simple map from cookie name to cookie
  //   value. If you want expiration time and attributes you'll have
  //   to parse it yourself. If there are multiple Set-Cookie headers
  //   for the same cookie it is unspecified which one you'll get.
  //
  // - You can provide a 'bodyStream' option which is a stream that
  //   will be used for the body of the request.
  //
  // - For authenticated MDG services, you can set the
  //   'useSessionHeader' and/or 'useAuthHeader' options (to true) to
  //   send X-Meteor-Session/X-Meteor-Auth headers using values from
  //   the session file.
  //
  // - forceSSL is always set to true. Always. And followRedirect is
  //   set to false since it doesn't understand origins (see comment
  //   in implementation).
  //
  // NB: With useSessionHeader and useAuthHeader, this function will
  // read *and possibly write to* the session file, so if you are
  // writing auth code (in auth.js) and you call it, be sure to reread
  // the session file afterwards.
  request: function (urlOrOptions, callback) {
    var options;
    if (!_.isObject(urlOrOptions))
      options = { url: urlOrOptions };
    else
      options = _.clone(urlOrOptions);

    var bodyStream;
    if (_.has(options, 'bodyStream')) {
      bodyStream = options.bodyStream;
      delete options.bodyStream;
    }

    // Body stream length for progress
    var bodyStreamLength = 0;
    if (_.has(options, 'bodyStream')) {
      bodyStreamLength = options.bodyStreamLength;
      delete options.bodyStreamLength;
    } else {
      // Guess the body stream length as 1MB
      // Hopefully if it's much bigger the caller will set it
      // If it is much small, we will pleasantly surprise the user!
      if (bodyStream) {
        bodyStreamLength = 1024 * 1024;
      }
    }

    // Response length for progress
    var responseLength = 128 * 1024;
    if (_.has(options, 'responseLength')) {
      responseLength = options.responseLength;
      delete options.responseLength;
    }

    var progress = null;
    if (_.has(options, 'progress')) {
      progress = options.progress;
      delete options.progress;

      if (callback) {
        throw new Error("Not safe to use progress with callback");
      }
    }

    options.headers = _.extend({
      'User-Agent': getUserAgent()
    }, options.headers || {});

    // This should never, ever be false, or else why are you using SSL?
    options.forceSSL = true;
    if (process.env.CAFILE) {
      options.ca = files.readFile(process.env.CAFILE);
    }

    // followRedirect is very dangerous because request does not
    // appear to segregate cookies by origin, so any cookies (and
    // apparently headers as well, eg X-Meteor-Auth) sent on the
    // original request could get forwarded to an unexpected domain in
    // a redirect. This is almost certainly not something you ever
    // want.
    options.followRedirect = false;

    var useSessionHeader = options.useSessionHeader;
    delete options.useSessionHeader;
    var useAuthHeader = options.useAuthHeader;
    delete options.useAuthHeader;
    if (useSessionHeader || useAuthHeader) {
      var sessionHeader = auth.getSessionId(config.getAccountsDomain());
      if (sessionHeader)
        options.headers['X-Meteor-Session'] = sessionHeader;
      if (callback)
        throw new Error("session header can't be used with callback");
    }
    if (useAuthHeader) {
      var authHeader = auth.getSessionToken(config.getAccountsDomain());
      if (authHeader)
        options.headers['X-Meteor-Auth'] = authHeader;
    }

    var fut;
    if (! callback) {
      fut = new Future();
      callback = function (err, response, body) {
        if (err) {
          fut['throw'](err);
          return;
        }

        var setCookie = {};
        _.each(response.headers["set-cookie"] || [], function (h) {
          var match = h.match(/^([^=\s]+)=([^;\s]+)/);
          if (match)
            setCookie[match[1]] = match[2];
        });

        if (useSessionHeader && _.has(response.headers, "x-meteor-session")) {
          auth.setSessionId(config.getAccountsDomain(),
                            response.headers['x-meteor-session']);
        }

        fut['return']({
          response: response,
          body: body,
          setCookie: setCookie
        });
      };
    }

    // try to get proxy from environment.
    // similar code is in packages/ddp/stream_client_nodejs.js
    var proxy = process.env.HTTP_PROXY || process.env.http_proxy || null;
    // if we're going to an https url, try the https_proxy env variable first.
    if (/^https/i.test(options.url)) {
      proxy = process.env.HTTPS_PROXY || process.env.https_proxy || proxy;
    }
    if (proxy && !options.proxy) {
      options.proxy = proxy;
    }

    // request is the most heavy-weight of the tool's npm dependencies; don't
    // require it until we definitely need it.
    Console.debug("Doing HTTP request: ", options.method || 'GET', options.url);
    var request = require('request');
    var req = request(options, callback);


    var totalProgress = { current: 0, end: bodyStreamLength + responseLength, done: false };

    if (bodyStream) {
      var dest = req;
      if (progress) {
        dest = new WritableWithProgress(dest, function (n, done) {
          if (!totalProgress.done) {
            totalProgress.current += n;
            progress.reportProgress(totalProgress);
          }
        });
      }
      bodyStream.pipe(dest);
    }

    if (progress) {
      httpHelpers._addProgressEvents(req);
      req.on('progress', function (state) {
        if (!totalProgress.done) {
          totalProgress.current = bodyStreamLength + state.current;
          totalProgress.end = bodyStreamLength + state.end;
          totalProgress.done = state.done;

          progress.reportProgress(totalProgress);
        }
      });
    }

    if (fut) {
      try {
        return fut.wait();
      } finally {
        if (progress) {
          progress.reportProgressDone();
        }
      }
    } else {
      return req;
    }
  },

  // Adds progress callbacks to a request
  // Based on request-progress
  _addProgressEvents: function (request) {
    var state;

    var emitProgress = function () {
      request.emit('progress', state);
    };

    request
      .on('response', function (response) {
        state = {};
        state.end = undefined;
        state.done = false;
        state.current = 0;
        var contentLength = response.headers['content-length'];
        if (contentLength) {
          state.end = Number(contentLength);
        }
        emitProgress();
      })
      .on('data', function (data) {
        state.current += data.length;
        emitProgress();
      })
      .on('end', function (data) {
        state.done = true;
        emitProgress();
      });
  },

  // A synchronous wrapper around request(...) that returns the response "body"
  // or throws.
  //
  // (This has gone through a few refactors and it might be possible
  // to fully roll it into httpHelpers.request() at this point.)
  getUrl: function (urlOrOptions) {
    try {
      var result = httpHelpers.request(urlOrOptions);
    } catch (e) {
      throw new files.OfflineError(e);
    }

    const response = result.response;
    const body = result.body;
    const href = response.request.href;

    if (response.statusCode >= 400 && response.statusCode < 600) {
      throw Error(
        body ||
          `Could not get ${href}; server returned [${response.statusCode}]`);
    } else {
      return body;
    }
  }

});
