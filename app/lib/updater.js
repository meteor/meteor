exports.CURRENT_VERSION = "0.1.1";

var fs = require("fs");
var https = require("https");
var path = require("path");
var semver = require("semver");

var manifest_options = {
  host: 's3.amazonaws.com',
  path: '/com.meteor.static/update/manifest.json'
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
  req.addListener('error', function () {
    // No-op makes node not crash!
    // http://rentzsch.tumblr.com/post/664884799/node-js-handling-refused-http-client-connections
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
}
