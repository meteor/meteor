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

// a bit of a hack
var getPackage = _.once(function () {
  return unipackage.load({
    library: release.current.library,
    packages: [ 'meteor', 'livedata' ],
    release: release.current.name
  });
});

var authenticatedDDPConnect = function (endpointUrl) {
  // Get auth token
  var parsedEndpoint = url.parse(endpointUrl);
  var authToken = auth.getSessionToken(parsedEndpoint.hostname);

  // XXX get the galaxy name from the hostname of endpointUrl,
  // and run the login command for that galaxy.
  //
  // XXX of course, that should not be done here (and we should
  // definitely not call process.exit!) -- it should be done much
  // further up the stack.
  if (! authToken) {
    process.stderr.write("You must be logged in before you can use " +
                         "this galaxy. Try logging in with " +
                         "'meteor login'.\n");
    process.exit(1);
  }

  var Package = getPackage();
  return Package.livedata.DDP.connect(endpointUrl, {
    headers: {
      cookie: "GALAXY_AUTH=" + authToken
    }
  });
};

// Returns a DDP connection to a service within a Galaxy.
//
// Does not wait for the connection to succeed. However, if the
// connection fails (defined as the connection not succeeding after a
// certain period of time), an error will be printed and the program
// will be killed!
//
// - galaxy: the name of the galaxy to connect to, as returned by
//   discoverGalaxy (as described theer, should probably be a galaxy
//   name, is currently a https or http URL)
// - service: the service to connect to within the Galaxy, such as
//   'ultraworld' or 'log-reader'.
var connectToService = function (galaxy, service) {
  var Package = getPackage();
  var endpointUrl = galaxy + "/" + service;

  var connection = authenticatedDDPConnect(endpointUrl);
  var timeout = Package.meteor.Meteor.setTimeout(function () {
    if (connection.status().status !== "connected") {
      process.stderr.write("Could not connect to galaxy " + endpointUrl
                           + ": " + connection.status().status + '\n');
      process.exit(1);
    }
  }, 10*1000);
  var close = connection.close;
  connection.close = function (/*arguments*/) {
    Package.meteor.Meteor.clearTimeout(timeout);
    close.apply(connection, arguments);
  };

  return connection;
};


var exitWithError = function (error, messages) {
  messages = messages || {};
  var msg = messages[error.error];
  if (msg)
    process.stderr.write(msg + "\n");
  else if (error.message)
    process.stderr.write("Denied: " + error.message + "\n");

  process.exit(1);
};


// XXX copied from galaxy/tool/galaxy.js
var prettyCall = function (galaxy, name, args, messages) {
  try {
    var ret = galaxy.apply(name, args);
  } catch (e) {
    exitWithError(e, messages);
  }
  return ret;
};


var prettySub = function (galaxy, name, args, messages) {
  var onError = function (e) {
    exitWithError(e, messages);
  };

  try {
    var ret = galaxy._subscribeAndWait(name, args, {onLateError: onError});
  } catch (e) {
    onError(e);
  }
  return ret;
};

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
  var conn = connectToService(galaxy, "ultraworld");
  conn.call("destroyApp", app);
  conn.close();
  process.stdout.write("Deleted.\n");
};

// options:
// - app
// - appDir
// - settings
// - bundleOptions
// - starball
// XXX refactor this to separate the "maybe bundle" part from "actually deploy"
//     so we can be careful to not rely on any of the app dir context when
//     in --star mode.
exports.deploy = function (options) {
  var tmpdir = files.mkdtemp('deploy');
  var buildDir = path.join(tmpdir, 'build');
  var topLevelDirName = path.basename(options.appDir);
  var bundlePath = path.join(buildDir, topLevelDirName);
  var bundler = require('./bundler.js');
  var starball;

  // Don't try to connect to galaxy before the bundle is done. Because bundling
  // doesn't yield, this will cause the connection to timeout. Eventually we'd
  // like to have bundle yield, so that we can connect (and make sure auth
  // works) before bundling.

  if (!options.starball) {
    process.stdout.write('Deploying ' + options.app + '. Bundling...\n');
    var bundleResult = bundler.bundle(options.appDir, bundlePath,
                                      options.bundleOptions);
    if (bundleResult.errors) {
      process.stdout.write("\n\nErrors prevented deploying:\n");
      process.stdout.write(bundleResult.errors.formatMessages());
      process.exit(1);
    }

    // S3 (which is what's likely on the other end our upload) requires
    // a content-length header for HTTP PUT uploads. That means that we
    // have to actually tgz up the bundle before we can start the upload
    // rather than streaming it. S3 has an alternate API for doing
    // chunked uploads, but (a) it has a minimum chunk size of 5 MB, so
    // it doesn't help us much (many/most stars will be smaller than
    // that), and (b) it's nonstandard, so we'd have to bake in S3's
    // specific scheme. Doesn't seem worthwhile for now, so just tar to
    // a temporary directory. If stars get radically bigger then it
    // might be worthwhile to tar to memory and spill to S3 every 5MB.
    starball = path.join(tmpdir, topLevelDirName + ".tar.gz");
    files.createTarball(bundlePath, starball);
  } else {
    starball = options.starball;
  }
  process.stdout.write('Uploading...\n');

  var galaxy = exports.discoverGalaxy(options.app);
  var conn = connectToService(galaxy, "ultraworld");
  var Package = getPackage();

  var created = true;
  var appConfig = {
      settings: options.settings
  };

  if (options.admin)
    appConfig.admin = true;

  try {
    conn.call('createApp', options.app, appConfig);
  } catch (e) {
    if (e instanceof Package.meteor.Meteor.Error && e.error === 'already-exists') {
      // Cool, it already exists. No problem. Just set the settings if they were
      // passed. We explicitly check for undefined because we want to allow you
      // to unset settings by passing an empty file.
      if (options.settings !== undefined) {
        try {
          conn.call('updateAppConfiguration', options.app, appConfig);
        } catch (e) {
          exitWithError(e);
        }
      }
      created = false;
    } else {
      exitWithError(e);
    }
  }

  // Get the upload information from Galaxy. It's a surprise if this
  // fails (we already know the app exists.)
  var info = prettyCall(conn, 'beginUploadStar',
                        [options.app, bundleResult.starManifest]);

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
      process.exit(1);
    }
    future.return();
  });

  fileStream.pipe(req);
  future.wait();

  var result = prettyCall(conn, 'completeUploadStar', [info.id], {
    'no-such-upload': 'Upload request expired. Try again.'
  });

  if (created)
    process.stderr.write(options.app + ": created app\n");

  process.stderr.write(options.app + ": " +
                       "pushed revision " + result.serial + "\n");
  // Close the connection to Galaxy (otherwise Node will continue running).
  conn.close();
};

// options:
// - app
// - streaming (BOOL)
exports.logs = function (options) {
  var galaxy = exports.discoverGalaxy(options.app);
  var logReader = connectToService(galaxy, "log-reader");

  var lastLogId = null;
  var Log = unipackage.load({
    library: release.current.library,
    packages: [ 'logging' ],
    release: release.current.name
  }).logging.Log;

  var ok = logReader.registerStore('logs', {
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
  // In case of reconnect recover the state so user sees only new logs
  logReader.onReconnect = function () {
    logsSubscription && logsSubscription.stop();
    var opts = { streaming: options.streaming };
    if (lastLogId)
      opts.resumeAfterId = lastLogId;
    logsSubscription = logReader.subscribe("logsForApp", options.app, opts);
  };
  logsSubscription = prettySub(logReader, "logsForApp",
                               [options.app, {streaming: options.streaming}],
                               {"no-such-app": "No such app: " + options.app});

  // if streaming is needed there is no point in closing connection
  if (! options.streaming) {
    // Close connection to log-reader (otherwise Node will continue running).
    logReader.close();
  }
};

exports.temporaryMongoUrl = function (app) {
  var galaxy = exports.discoverGalaxy(app);
  var conn = connectToService(galaxy, "ultraworld");
  var mongoUrl = conn.call('getTemporaryMongoUrl', app);
  conn.close();
  return mongoUrl;
};
