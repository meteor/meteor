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
      packages: [ 'livedata' ],
      release: context.releaseVersion,
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


// XXX copied from galaxy/tool/galaxy.js
var exitWithError = function (error, messages) {
  messages = messages || {};

  if (! (error instanceof Meteor.Error))
    throw error; // get a stack

  var msg = messages[error.error];
  if (msg)
    process.stderr.write(msg + "\n");
  else if (error instanceof Meteor.Error)
    process.stderr.write("Denied: " + error.message + "\n")

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


exports.deleteService = function (service) {
  throw new Error("Not implemented");
};

// options:
// - context
// - service
// - appDir
// - settings
// - bundleOptions
exports.deploy = function (options) {
  var galaxy = getGalaxy(options.context);
  var Meteor = getMeteor(options.context);

  process.stdout.write('Deploying ' + options.service + '. Bundling...\n');
  var tmpdir = files.mkdtemp('deploy');
  var buildDir = path.join(tmpdir, 'build');
  var topLevelDirName = path.basename(options.appDir);
  var bundlePath = path.join(buildDir, topLevelDirName);
  var bundler = require('./bundler.js');
  var bundleResult = bundler.bundle(options.appDir, bundlePath,
                                    options.bundleOptions);
  if (bundleResult.errors) {
    process.stdout.write("\n\nErrors prevented deploying:\n");
    process.stdout.write(bundleresult.errors.formatMessages());
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
  var tarball = path.join(tmpdir, topLevelDirName + ".tar.gz");
  files.createTarball(bundlePath, tarball);

  process.stdout.write('Uploading...\n');

  var created = true;
  try {
    galaxy.call('createService', options.service);
  } catch (e) {
    if (e instanceof Meteor.Error && e.error === 'already-exists') {
      // Cool, it already exists. No problem.
      created = false;
    } else {
      exitWithError(e);
    }
  }

  // Get the upload information from Galaxy. It's a surprise if this
  // fails (we already know the service exists.)
  var info = prettyCall(galaxy, 'beginUploadStar', [options.service]);

  // Upload
  // XXX copied from galaxy/tool/galaxy.js
  var fileSize = fs.statSync(tarball).size;
  var fileStream = fs.createReadStream(tarball);
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
    process.stderr.write(options.service + ": created service\n");

  process.stderr.write(options.service + ": " +
                       "pushed revision " + result.serial + "\n");
};
