var Future = require('fibers/future');
var files = require('./files.js');
var path = require('path');
var fs = require('fs');
var unipackage = require('./unipackage.js');
var fiberHelpers = require('./fiber-helpers.js');
var Fiber = require('fibers');
var httpHelpers = require('./http-helpers.js');
var _ = require('underscore');

// a bit of a hack
var getPackage = _.once(function (context) {
  return unipackage.load({
    library: context.library,
    packages: [ 'meteor', 'livedata' ],
    release: context.releaseVersion
  });
});

var getGalaxy = _.once(function (context) {
  var Package = getPackage(context);
  if (!context.galaxy) {
    process.stderr.write("Could not find a deploy endpoint. " +
                         "You can set the GALAXY environment variable, " +
                         "or configure your site's DNS to resolve to " +
                         "your Galaxy's proxy.\n");
    process.exit(1);
  }

  var galaxy = Package.livedata.DDP.connect(context.galaxy.url);
  var timeout = Package.meteor.Meteor.setTimeout(function () {
    if (galaxy.status().status !== "connected") {
      process.stderr.write("Could not connect to galaxy " + context.galaxy.url
                           + ": " + galaxy.status().status + '\n');
      process.exit(1);
    }
  }, 10*1000);
  var close = galaxy.close;
  galaxy.close = function (/*arguments*/) {
    Package.meteor.Meteor.clearTimeout(timeout);
    close.apply(galaxy, arguments);
  };
  return galaxy;
});


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

exports.discoverGalaxy = function (app) {
  app = app + ":" + (process.env.DISCOVERY_PORT || 443);
  var url = "https://" + app + "/_GALAXY_";
  var fut = new Future();

  if (process.env.GALAXY)
    return process.env.GALAXY;

  // At some point we may want to send a version in the request so that galaxy
  // can respond differently to different versions of meteor.
  httpHelpers.request({
    url: url,
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
      fut.return(body.galaxyUrl);
    } else {
      fut.return(null);
    }
  });
  return fut.wait();
};

exports.deleteApp = function (app, context) {
  var galaxy = getGalaxy(context);
  galaxy.call("destroyApp", app);
  galaxy.close();
  process.stdout.write("Deleted.\n");
};

// options:
// - context
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


  var galaxy = getGalaxy(options.context);
  var Package = getPackage(options.context);

  var created = true;
  var appConfig = {
      settings: options.settings
  };

  if (options.admin)
    appConfig.admin = true;

  try {
    galaxy.call('createApp', options.app, appConfig);
  } catch (e) {
    if (e instanceof Package.meteor.Meteor.Error && e.error === 'already-exists') {
      // Cool, it already exists. No problem. Just set the settings if they were
      // passed. We explicitly check for undefined because we want to allow you
      // to unset settings by passing an empty file.
      if (options.settings !== undefined) {
        try {
          galaxy.call('updateAppConfiguration', options.app, appConfig);
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
  var info = prettyCall(galaxy, 'beginUploadStar', [options.app, bundleResult.starManifest]);

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

  var result = prettyCall(galaxy, 'completeUploadStar', [info.id], {
    'no-such-upload': 'Upload request expired. Try again.'
  });

  if (created)
    process.stderr.write(options.app + ": created app\n");

  process.stderr.write(options.app + ": " +
                       "pushed revision " + result.serial + "\n");
  // Close the connection to Galaxy (otherwise Node will continue running).
  galaxy.close();
};

// options:
// - context
// - app
// - streaming (BOOL)
exports.logs = function (options) {
  var logReaderURL;
  if (options.context.galaxy.adminBaseUrl) {
    logReaderURL = options.context.galaxy.adminBaseUrl + "log-reader";
  } else {
    var galaxy = getGalaxy(options.context);
    logReaderURL = prettyCall(galaxy, "getLogReaderURL", [], {
      'no-log-reader': "Can't find log reader service"
    });
    galaxy.close();
  }

  var lastLogId = null;
  var logReader =
        getPackage(options.context).livedata.DDP.connect(logReaderURL);
  var Log = unipackage.load({
    library: options.context.library,
    packages: [ 'logging' ],
    release: options.context.releaseVersion
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

  if (!ok)
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
  if (!options.streaming) {
    // Close connections to Galaxy and log-reader
    // (otherwise Node will continue running).
    logReader.close();
  }
};

// options:
// - context
// - app
exports.temporaryMongoUrl = function (options) {
  var galaxy = getGalaxy(options.context);
  var url = galaxy.call('getTemporaryMongoUrl', options.app);
  galaxy.close();
  return url;
};
