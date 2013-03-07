// During automated QA of the updater, modify this file to set testingUpdater to
// true. This will make it act as if it is at version 0.1.0 and use test URLs
// for update checks.
var testingUpdater = false;

var fs = require("fs");
var http = require("http");
var https = require("https");
var path = require("path");
var semver = require("semver");
var Future = require('fibers/future');

var files = require(path.join(__dirname, 'files.js'));

var manifestUrl = testingUpdater
      ? 'https://s3.amazonaws.com/com.meteor.static/test/update/manifest.json'
      : 'https://update.meteor.com/manifest.json';


/**
 * Downloads the current manifest file and returns it via a callback (or
 * null on error)
 */
exports.getManifest = function () {
  return Future.wrap(files.getUrl)({url: manifestUrl, json: true}).wait();
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
