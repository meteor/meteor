var Future = require('fibers/future');
var files = require('./files.js');
var config = require('./config.js');
var path = require('path');
var fs = require('fs');
var unipackage = require('./unipackage.js');
var fiberHelpers = require('./fiber-helpers.js');
var Fiber = require('fibers');
var httpHelpers = require('./http-helpers.js');
var auth = require('./auth.js');
var release = require('./release.js');
var url = require('url');
var _ = require('underscore');
var buildmessage = require('./buildmessage.js');

// a bit of a hack
var getPackage = _.once(function () {
  return unipackage.load({
    library: release.current.library,
    packages: [ 'meteor', 'livedata' ],
    release: release.current.name
  });
});

// If 'error' is an exception that we know how to report in a
// user-friendly way, print an approprite message to stderr and return
// an appropriate exit status for a command. Else rethrow error.
//
// galaxyName should be the name of the galaxy that we're talking to.
// If messages is provided, it is a map from DDP error names to
// human-readable explanation to use.
var handleError = function (error, galaxyName, messages) {
  var Package = getPackage();
  messages = messages || {};

  if (error instanceof Package.meteor.Meteor.Error) {
    var msg = messages[error.error];
    if (msg)
      process.stderr.write(msg + "\n");
    else if (error.message)
      process.stderr.write("Denied: " + error.message + "\n");
    return 1;
  } else if (error instanceof ConnectionTimeoutError) {
    // If we have an http/https URL for a galaxyName instead of a
    // proper galaxyName (which is what the code in this file
    // currently passes), strip off the scheme and trailing slash.
    var m = galaxyName.match(/^https?:\/\/(.*[^\/])\/?$/);
    if (m)
      galaxyName = m[1];

    process.stderr.write(galaxyName + ": connection failed");
    return 1;
  } else {
    throw error;
  }
};

// Wrapper to manage a DDP connection to a service within a
// Galaxy. Provides (1) authentication from the credential cache, (2)
// failing method calls and subscriptions if, after 10 seconds, we're
// not connected. This functionality should eventually end up in the
// DDP client in one form or other.
//
// - galaxy: the name of the galaxy to connect to, as returned by
//   discoverGalaxy (as described there, should probably be a galaxy
//   name, but currently is a https or http URL)
// - service: the service to connect to within the Galaxy, such as
//   'ultraworld' or 'log-reader'.
var ConnectionTimeoutError = function () {};
var ServiceConnection = function (galaxy, service) {
  var self = this;
  var Package = getPackage();
  var endpointUrl = galaxy + "/" + service;
  var parsedEndpoint = url.parse(endpointUrl);
  var authToken = auth.getSessionToken(parsedEndpoint.hostname);

  // XXX XXX higher up on the stack, we need to get the galaxy name
  // from the hostname of endpointUrl, and run the login command for
  // that galaxy.
  if (! authToken)
    throw new Error("not logged in to galaxy?");

  self.connection = Package.livedata.DDP.connect(endpointUrl, {
    headers: {
      cookie: "GALAXY_AUTH=" + authToken
    }
  });

  self.connectionTimeoutCallbacks = [];
  self.connectionTimer = Package.meteor.Meteor.setTimeout(function () {
    if (self.connection.status().status !== "connected") {
      self.connection = null;
      _.each(self.connectionTimeoutCallbacks, function (f) {
        f();
      });
      self.connectionTimeoutCallbacks = [];
    }
  }, 10*1000);
};

_.extend(ServiceConnection.prototype, {
  _onConnectionTimeout: function (f) {
    var self = this;
    if (! self.connection)
      f();
    else
      self.connectionTimeoutCallbacks.push(f);
  },

  call: function (/* arguments */) {
    var self = this;
    var fut = new Future;
    self._onConnectionTimeout(function () {
      fut['throw'](new ConnectionTimeoutError);
    });

    var args = _.toArray(arguments);
    var name = args.shift();
    self.connection.apply(name, args, function (err, result) {
      if (err) {
        fut['throw'](err);
      } else {
        self._cleanUpTimer();
        fut['return'](result);
      }
    });

    return fut.wait();
  },

  // XXX derived from _subscribeAndWait in livedata_connection.js
  // -- but with a different signature..
  subscribeAndWait: function (/* arguments */) {
    var self = this;

    var fut = new Future();
    self._onConnectionTimeout(function () {
      fut['throw'](new ConnectionTimeoutError);
    });

    var ready = false;
    var args = _.toArray(arguments);
    args.push({
      onReady: function () {
        ready = true;
        self._cleanUpTimer();
        fut['return']();
      },
      onError: function (e) {
        if (! ready)
          fut['throw'](e);
        else
          /* XXX handle post-ready error */;
      }
    });

    var sub = self.connection.subscribe.apply(self.connection, args);
    fut.wait();
    return sub;
  },

  _cleanUpTimer: function () {
    var self = this;
    var Package = getPackage();
    Package.meteor.Meteor.clearTimeout(self.connectionTimer);
    self.connectionTimer = null;
  },

  close: function () {
    var self = this;
    if (self.connection) {
      self.connection.close();
      self.connection = null;
    }
    if (self.connectionTimer) {
      // Clean up the timer so that Node can exit cleanly
      self._cleanUpTimer();
    }
  }
});


// Determine if a particular site is hosted by Galaxy, and if so, by
// which Galaxy. 'app' should be a hostname, like 'myapp.meteor.com'
// or 'mysite.com'. Returns the base URL for the Galaxy
// (https://[galaxyname], or possibly http://[galaxyname] if running
// locally). The URL will not have a trailing slash. Returns null if
// the site is not hosted by Galaxy.
//
// The result is cached, so there is no penality for calling this
// function multiple times (during the same run of the
// tool). (Assuming you wait for the first call to complete before
// making the subsequent calls. The caching doesn't kick in until the
// first call returns.)
//
// XXX in the future, should probably return the name of the Galaxy,
// rather than a URL.
//
// XXX at many places in this file we call discoverGalaxy and don't
// check its return value. This is safe because we expect that
// command.js will have already called discoverGalaxy on the same app
// before we get here, and gotten a satisfactory value, which is now
// cached. But it's not great -- add better error handling.
var discoveryCache = {};
exports.discoverGalaxy = function (app) {
  var cacheKey = app;
  if (_.has(discoveryCache, cacheKey))
    return discoveryCache[cacheKey];

  app = app + ":" + config.getDiscoveryPort();
  var discoveryUrl = "https://" + app + "/_GALAXY_";
  var fut = new Future();

  if (process.env.GALAXY)
    return process.env.GALAXY;

  // At some point we may want to send a version in the request so that galaxy
  // can respond differently to different versions of meteor.
  httpHelpers.request({
    url: discoveryUrl,
    json: true,
    strictSSL: true,
    // We don't want to be confused by, eg, a non-Galaxy-hosted site which
    // redirects to a Galaxy-hosted site.
    followRedirect: false
  }, function (err, resp, body) {
    if (! err &&
        resp.statusCode === 200 &&
        body &&
        _.has(body, "galaxyDiscoveryVersion") &&
        _.has(body, "galaxyUrl") &&
        (body.galaxyDiscoveryVersion === "galaxy-discovery-pre0")) {
      var result = body.galaxyUrl;

      if (result.indexOf("https://") === -1)
        result = "https://" + result;

      if (result[result.length - 1] === "/")
        result = result.substring(0, result.length - 1);

      fut.return(result);
    } else {
      fut.return(null);
    }
  });

  var result = fut.wait();
  discoveryCache[cacheKey] = result;
  return result;
};

exports.deleteApp = function (app) {
  var galaxy = exports.discoverGalaxy(app);
  var conn = new ServiceConnection(galaxy, "ultraworld");

  try {
    conn.call("destroyApp", app);
    process.stdout.write("Deleted.\n");
  } catch (e) {
    return handleError(e, galaxy);
  } finally {
    conn.close();
  }
};

// Returns exit code for deploy command.
//
// options:
// - app
// - appDir
// - settingsFile
// - buildOptions
// - starball
// XXX refactor this to separate the "maybe bundle" part from "actually deploy"
//     so we can be careful to not rely on any of the app dir context when
//     in --star mode.
exports.deploy = function (options) {
  var conn = null;

  try {
    var tmpdir = files.mkdtemp('deploy');
    var buildDir = path.join(tmpdir, 'build');
    var topLevelDirName = path.basename(options.appDir);
    var bundlePath = path.join(buildDir, topLevelDirName);
    var bundler = require('./bundler.js');
    var starball;

    var settings = null;
    var messages = buildmessage.capture({
      title: "preparing to deploy",
      rootPath: process.cwd()
    }, function () {
      if (options.settingsFile)
        settings = files.getSettings(options.settingsFile);
    });

    // Don't try to connect to galaxy before the bundle is
    // done. Because bundling doesn't yield, this will cause the
    // connection to time out. Eventually we'd like to have bundle
    // yield, so that we can connect (and make sure auth works)
    // concurrent with bundling.

    if (! options.starball && ! messages.hasMessages()) {
      process.stdout.write('Deploying ' + options.app + '. Bundling...\n');
      var bundleResult = bundler.bundle({
        appDir: options.appDir,
        outputPath: bundlePath,
        nodeModulesMode: 'skip',
        buildOptions: options.buildOptions
      });

      if (bundleResult.errors) {
        messages.merge(bundleResult.errors);
      } else {
        // S3 (which is what's likely on the other end our upload)
        // requires a content-length header for HTTP PUT uploads. That
        // means that we have to actually tgz up the bundle before we
        // can start the upload rather than streaming it. S3 has an
        // alternate API for doing chunked uploads, but (a) it has a
        // minimum chunk size of 5 MB, so it doesn't help us much
        // (many/most stars will be smaller than that), and (b) it's
        // nonstandard, so we'd have to bake in S3's specific
        // scheme. Doesn't seem worthwhile for now, so just tar to a
        // temporary directory. If stars get radically bigger then it
        // might be worthwhile to tar to memory and spill to S3 every
        // 5MB.
        starball = path.join(tmpdir, topLevelDirName + ".tar.gz");
        files.createTarball(bundlePath, starball);
      }
    } else {
      starball = options.starball;
    }

    if (messages.hasMessages()) {
      process.stdout.write("\nErrors prevented deploying:\n");
      process.stdout.write(messages.formatMessages());
      return 1;
    }

    process.stdout.write('Uploading...\n');

    var galaxy = exports.discoverGalaxy(options.app);
    conn = new ServiceConnection(galaxy, "ultraworld");
    var Package = getPackage();

    var created = true;
    var appConfig = {};
    if (settings !== null)
      appConfig.settings = settings;

    if (options.admin)
      appConfig.admin = true;

    try {
      conn.call('createApp', options.app, appConfig);
    } catch (e) {
      if (e instanceof Package.meteor.Meteor.Error &&
          e.error === 'already-exists') {
        // Cool, it already exists. No problem. Just set the settings
        // if they were passed. We explicitly check for undefined
        // because we want to allow you to unset settings by passing
        // an empty file.
        if (appConfig.settings !== undefined) {
          conn.call('updateAppConfiguration', options.app, appConfig);
        }
        created = false;
      } else {
        return handleError(e, galaxy);
      }
    }

    // Get the upload information from Galaxy. It's a surprise if this
    // fails (we already know the app exists).
    try {
      var info = conn.call('beginUploadStar', options.app,
                           bundleResult.starManifest);
    } catch (e) {
      return handleError(e, galaxy);
    }

    // Upload
    // XXX copied from galaxy/tool/galaxy.js
    var fileSize = fs.statSync(starball).size;
    var fileStream = fs.createReadStream(starball);
    var future = new Future;
    var req = httpHelpers.request({
      method: "PUT",
      url: info.put,
      headers: { 'content-length': fileSize,
                 'content-type': 'application/octet-stream' },
      strictSSL: true
    }, function (error, response, body) {
      if (error || ((response.statusCode !== 200)
                    && (response.statusCode !== 201))) {
        if (error && error.message)
          process.stderr.write("Upload failed: " + error.message + "\n");
        else
          process.stderr.write("Upload failed" +
                               (response.statusCode ?
                                " (" + response.statusCode + ")\n" : "\n"));
        future['return'](false);
      } else
        future['return'](true);
    });

    fileStream.pipe(req);
    var uploadSucceeded = future.wait();
    if (! uploadSucceeded)
      return 1;

    try {
      var result = conn.call('completeUploadStar', info.id);
    } catch (e) {
      return handleError(e, galaxy, {
        'no-such-upload': 'Upload request expired. Try again.'
      });
    }

    if (created)
      process.stderr.write(options.app + ": created app\n");

    process.stderr.write(options.app + ": " +
                         "pushed revision " + result.serial + "\n");
    return 0;
  } finally {
    // Close the connection to Galaxy (otherwise Node will continue running).
    conn && conn.close();
  }
};

// options:
// - app
// - streaming (BOOL)
//
// The log messages are printed. Returns a command exit code, or if
// streaming is true and streaming was successfully started, returns
// null.
exports.logs = function (options) {
  var galaxy = exports.discoverGalaxy(options.app);
  var logReader = new ServiceConnection(galaxy, "log-reader");

  try {
    var lastLogId = null;
    var Log = unipackage.load({
      library: release.current.library,
      packages: [ 'logging' ],
      release: release.current.name
    }).logging.Log;

    // XXX we're cheating a bit here, relying on the server sending
    // the log messages in order
    var ok = logReader.connection.registerStore('logs', {
      update: function (msg) {
        // Ignore all messages but 'changed'
        if (msg.msg !== 'changed')
          return;
        var obj = msg.fields.obj;
        lastLogId = msg.fields.id;
        obj = Log.parse(obj);
        obj && console.log(Log.format(obj, {color: true}));
      }
    });

    if (! ok)
      throw new Error("Can't listen to messages on the logs collection");

    var logsSubscription = null;
    try {
      logsSubscription =
        logReader.subscribeAndWait("logsForApp", options.app,
                                   { streaming: options.streaming });
    } catch (e) {
      return handleError(e, galaxy, {
        "no-such-app": "No such app: " + options.app
      });
    }

    // In case of reconnect recover the state so user sees only new logs.
    // Only set up the onReconnect handler after the subscribe and wait
    // has returned; if we set it up before, then we'll end up with two
    // subscriptions, because the onReconnect handler will run for the
    // first time before the subscribeAndWait returns.
    logReader.connection.onReconnect = function () {
      logsSubscription && logsSubscription.stop();
      var opts = { streaming: options.streaming };
      if (lastLogId)
        opts.resumeAfterId = lastLogId;
      // Don't use subscribeAndWait here; it'll deadlock. We can't
      // process the sub messages until `onReconnect` returns, and
      // `onReconnect` won't return unless the sub messages have been
      // processed. There's no reason we need to wait for the sub to be
      // ready here anyway.
      // XXX correctly handle errors on resubscribe
      logsSubscription = logReader.connection.subscribe(
        "logsForApp",
        options.app,
        opts
      );
    };

    return options.streaming ? null : 0;
  } finally {
    // If not streaming, close the connection to log-reader so that
    // Node can exit cleanly. If streaming, leave the connection open
    // so that we continue to get logs.
    if (! options.streaming) {
      logReader.close();
    }
  }
};

// On failure, prints a message to stderr and returns null. Otherwise,
// returns a temporary authenticated Mongo URL allowing access to this
// site's database.
exports.temporaryMongoUrl = function (app) {
  var galaxy = exports.discoverGalaxy(app);
  var conn = new ServiceConnection(galaxy, "ultraworld");

  try {
    var mongoUrl = conn.call('getTemporaryMongoUrl', app);
  } catch (e) {
    handleError(e, galaxy);
    return null;
  } finally {
    conn.close();
  }

  return mongoUrl;
};
