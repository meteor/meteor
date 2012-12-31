// During automated QA of the updater, modify this file to set testingUpdater to
// true. This will make it act as if it is at version 0.1.0 and use test URLs
// for update checks.
var testingUpdater = false;
exports.CURRENT_VERSION = testingUpdater ? "0.1.0" : "0.5.3";

var fs = require("fs");
var http = require("http");
var https = require("https");
var path = require("path");
var semver = require("semver");

var files = require(path.join(__dirname, 'files.js'));

var manifest_options = testingUpdater ? {
  host: 's3.amazonaws.com',
  path: '/com.meteor.static/test/update/manifest.json'
} : {
  host: 'update.meteor.com',
  path: '/manifest.json'
};


/**
 * Downloads the current manifest file and returns it via a callback (or
 * null on error)
 */
exports.get_manifest = function (callback) {
  var req = https.request(manifest_options, function(res) {
    if (res.statusCode !== 200) {
      callback(null);
      return;
    }
    res.setEncoding('utf8');
    var manifest = '';
    res.on('data', function (chunk) {
      manifest = manifest + chunk;
    });
    res.on('end', function () {
      var parsed;
      try {
        parsed = JSON.parse(manifest);
      } catch (err) {
        parsed = null;
      };
      callback(parsed);
    });
  });
  req.addListener('error', function (err) {
    // Need to register an error handler or node will crash:
    // http://rentzsch.tumblr.com/post/664884799/node-js-handling-refused-http-client-connections

    callback(null);
  });
  req.end();
};

/**
 * Takes a version string (or a manifest object) and returns true if
 * this copy is out of date.
 */
exports.needs_upgrade = function (version) {
  if (version && typeof version !== "string") {
    version = version.version;
  }
  if (!version) return false;

  return semver.lt(exports.CURRENT_VERSION, version);
};


exports.git_sha = function () {
  var d = files.get_dev_bundle();
  var f = path.join(d, ".git_version.txt");

  if (fs.existsSync(f)) {
    try {
      var contents = fs.readFileSync(f, 'utf8');
      contents = contents.replace(/\s+$/, "");
      return contents;
    } catch (err) { }
  }

  return null;
};
