///
/// utility functions for dealing with urls and http
///

var os = require('os');
var util = require('util');

var _ = require('underscore');
var request = require('request');
var Future = require('fibers/future');

var files = require('./files.js');
var auth = require('./auth.js');
var config = require('./config.js');

// Compose a User-Agent header. 'meteorReleaseContext' is optional. If
// provided, it is used to give more precise information about the
// Meteor version we're running.
var getUserAgent = function (meteorReleaseContext) {
  var appVersion;
  try {
    appVersion = files.getToolsVersion();
  } catch(e) {
    appVersion = 'checkout';
  }

  // meteorReleaseContext - an option with information about app directory
  // release versions, etc, is used to get exact Meteor version used.
  if (meteorReleaseContext !== undefined) {
    // Get meteor app release version: if specified in command line args, take
    // releaseVersion, if not specified, try global meteor version
    appVersion = meteorReleaseContext.releaseVersion;

    if (appVersion === 'none')
      appVersion = meteorReleaseContext.appReleaseVersion;
    if (appVersion === 'none')
      appVersion = 'checkout';
  }

  return util.format('Meteor/%s OS/%s (%s; %s; %s;)', appVersion,
                     os.platform(), os.type(), os.release(), os.arch());
};


var httpHelpers = exports;
_.extend(exports, {
  // A wrapper around request with the following improvements:
  //
  // - It will respect proxy environment variables if present
  //   (HTTP_PROXY or HTTPS_PROXY as appropriate).
  //
  // - It will set a reasonable User-Agent header. (And if you pass a
  //   'meteorReleaseContext' option, set to the return value of the
  //   calculateContext() function in meteor.js, that header will
  //   include the Meteor release in use, instead of just the tool
  //   version.)
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
  //   'useSessionCookie' and/or 'useAuthCookie' options (to true) to
  //   send the appropriate cookies from the session file.
  //
  // - forceSSL is always set to true. Always.
  //
  // NB: With useSessionCookie and useAuthCookie, this function will
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

    var ua;
    if (_.has(options, 'meteorReleaseContext')) {
      ua = getUserAgent(options.meteorReleaseContext);
      delete options.meteorReleaseContext;
    } else {
      ua = getUserAgent();
    }
    options.headers = _.extend({
      'User-Agent': ua
    }, options.headers || {});

    options.forceSSL = true;

    var cookies = {};
    var useSessionCookie = options.useSessionCookie;
    delete options.useSessionCookie;
    var useAuthCookie = options.useAuthCookie;
    delete options.useAuthCookie;
    if (useSessionCookie || useAuthCookie) {
      var sessionCookie = auth.getSessionId(config.getAccountsDomain());
      if (sessionCookie)
        cookies['METEOR_SESSION'] = sessionCookie;
      if (callback)
        throw new Error("session cookie can't be used with callback");
    }
    if (useAuthCookie) {
      var authCookie = auth.getSessionToken(config.getAccountsDomain());
      if (authCookie)
        cookies['METEOR_AUTH'] = authCookie;
    }
    if (_.keys(cookies).length) {
      if (_.has(options.headers, 'cookie'))
        throw new Error("already has cookies? sorry, not implemented");
      options.headers.cookie = _.map(cookies, function (value, key) {
        return key + "=" + value;
      }).join(";");
    }

    var fut;
    if (! callback) {
      fut = new Future();
      callback = function (err, response, body) {
        if (err)
          fut.throw(err);

        var setCookie = {};
        _.each(response.headers["set-cookie"] || [], function (h) {
          var match = h.match(/^([^=\s]+)=([^;\s]+)/);
          if (match)
            setCookie[match[1]] = match[2];
        });

        if (useSessionCookie && setCookie.METEOR_SESSION) {
          auth.setSessionId(config.getAccountsDomain(),
                            setCookie.METEOR_SESSION);
        }

        fut.return({
          response: response,
          body: body,
          setCookie: setCookie
        });
      };
    }

    // try to get proxy from environment
    var proxy = process.env.HTTP_PROXY || process.env.http_proxy || null;
    // if we're going to an https url, try the https_proxy env variable first.
    if (/^https/i.test(options.url)) {
      proxy = process.env.HTTPS_PROXY || process.env.https_proxy || proxy;
    }
    if (proxy && !options.proxy) {
      options.proxy = proxy;
    }

    var req = request(options, callback);

    if (bodyStream)
      bodyStream.pipe(req);

    if (fut)
      return fut.wait();
    else
      return req;
  },

  // A synchronous wrapper around request(...) that returns the response "body"
  // or throws.
  //
  // (This has gone through a few refactors and it might be possible
  // to fully roll it into httpHelpers.request() at this point.)
  getUrl: function (urlOrOptions, callback) {
    try {
      var result = httpHelpers.request(urlOrOptions);
    } catch (e) {
      throw new files.OfflineError(e);
    }

    var response = result.response;
    var body = result.body;

    if (response.statusCode >= 400 && response.statusCode < 600)
      throw response;
    else
      return body;
  }

});
