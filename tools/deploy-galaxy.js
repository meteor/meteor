var Future = require('fibers/future');
var files = require('./files.js');
var path = require('path');
var fs = require('fs');
var unipackage = require('./unipackage.js');

// a bit of a hack
var _meteor;
var getMeteor = function (context) {
  if (! _meteor) {
    _meteor = unipackage.load({
      library: context.library,
      packages: [ 'livedata', 'mongo-livedata' ],
      release: context.releaseVersion
    }).meteor.Meteor;
  }

  return _meteor;
};

var _galaxy;
var getGalaxy = function (context) {
  if (! _galaxy) {
    var Meteor = getMeteor(context);
    if (! ('GALAXY' in process.env)) {
      process.stderr.write("GALAXY environment variable must be set.\n");
      process.exit(1);
    }

    _galaxy = Meteor.connect(process.env['GALAXY']);
  }

  return _galaxy;
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
  try {
    var ret = galaxy._subscribeAndWait.apply(galaxy, [name].concat(args));
  } catch (e) {
    exitWithError(e, messages);
  }
  return ret;
};


exports.deleteApp = function (app) {
  throw new Error("Not implemented");
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
  var galaxy = getGalaxy(options.context);
  var Meteor = getMeteor(options.context);

  var tmpdir = files.mkdtemp('deploy');
  var buildDir = path.join(tmpdir, 'build');
  var topLevelDirName = path.basename(options.appDir);
  var bundlePath = path.join(buildDir, topLevelDirName);
  var bundler = require('./bundler.js');
  var starball;
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

  var created = true;
  try {
    galaxy.call('createApp', options.app);
  } catch (e) {
    if (e instanceof Meteor.Error && e.error === 'already-exists') {
      // Cool, it already exists. No problem.
      created = false;
    } else {
      exitWithError(e);
    }
  }

  // Get the upload information from Galaxy. It's a surprise if this
  // fails (we already know the app exists.)
  var info = prettyCall(galaxy, 'beginUploadStar', [options.app]);

  // Upload
  // XXX copied from galaxy/tool/galaxy.js
  var fileSize = fs.statSync(starball).size;
  var fileStream = fs.createReadStream(starball);
  var request = require('request');
  var future = new Future;
  var req = request.put({
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
exports.logs = function (options) {
  var galaxy = getGalaxy(options.context);
  var logReaderURL = prettyCall(galaxy, "getLogReaderURL", [], {
    'no-log-reader': "Can't find log reader service"
  });

  var logReader = getMeteor().connect(logReaderURL);

  var Log = unipackage.load({
    library: options.context.library,
    packages: [ 'logging' ],
    release: options.context.releaseVersion
  }).logging.Log;

  var Collection = getMeteor().Collection;
  var Logs = new Collection("logs", logReader);
  Logs.find().observe({
    added: function(log) {
      var parsed = Log.parse(log.obj);
      if (parsed)
        console.log(Log.format(parsed, {color: true}));
    }
  });

  // XXX make this talk to a separate logReader service instead of
  // ultraworld direcly
  prettySub(logReader, "logsForApp", [options.app], {
    "no-such-app": "No such app: " + options.app
  });

  // Close connections to Galaxy and log-reader (otherwise Node will continue running).
  galaxy.close();
  logReader.close();
};