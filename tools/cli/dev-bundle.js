// Note that this file is required before we install our Babel hooks in
// ../tool-env/install-babel.js, so we can't use ES2015+ syntax here.

// This file replicates some functionality from elsewhere in tools code,
// but that's unavoidable if we don't want to install Babel and load all
// the rest of the code every time we run `meteor npm` or `meteor node`.

var fs = require("fs");
var path = require("path");
var links = require("./dev-bundle-links.js");
var finder = require("./file-finder.js");
var rootDir = path.resolve(__dirname, "..", "..");
var defaultDevBundlePromise =
  Promise.resolve(path.join(rootDir, "dev_bundle"));

function getDevBundleDir() {
  // Note that this code does not care if we are running meteor from a
  // checkout, because it's always better to respect the .meteor/release
  // file of the current app, if possible.

  var releaseFile = finder.findReleaseFile();
  if (! releaseFile) {
    return defaultDevBundlePromise;
  }

  var localDir = finder.findLocalDir(releaseFile);
  if (! localDir) {
    return defaultDevBundlePromise;
  }

  var devBundleLink = path.join(localDir, "dev_bundle");
  if (finder.statOrNull(devBundleLink)) {
    return new Promise(function (resolve) {
      resolve(links.readLink(devBundleLink));
    });
  }

  var release = fs.readFileSync(
    releaseFile, "utf8"
  ).replace(/^\s+|\s+$/g, "");

  if (! /^METEOR@\d+/.test(release)) {
    return defaultDevBundlePromise;
  }

  return Promise.resolve(
    getDevBundleForRelease(release)
  ).then(function (devBundleDir) {
    if (devBundleDir) {
      links.makeLink(devBundleDir, devBundleLink);
      return devBundleDir;
    }

    return defaultDevBundlePromise;
  });
}

function getDevBundleForRelease(release) {
  var parts = release.split("@");
  if (parts.length < 2) {
    return null;
  }

  var track = parts[0];
  var version = parts.slice(1).join("@");

  var packageMetadataDir = finder.findPackageMetadataDir();
  if (! packageMetadataDir) {
    return null;
  }

  var meteorToolDir = finder.findMeteorToolDir(packageMetadataDir);
  if (! meteorToolDir) {
    return null;
  }

  var dbPath = finder.findDbPath(packageMetadataDir);
  if (! meteorToolDir) {
    return null;
  }

  var sqlite3 = require("sqlite3");
  var db = new sqlite3.Database(dbPath);

  return new Promise(function (resolve, reject) {
    db.get(
      "SELECT content FROM releaseVersions WHERE track=? AND version=?",
      [track, version],
      function (error, data) {
        error ? reject(error) : resolve(data);
      }
    );

  }).then(function (data) {
    if (data) {
      var tool = JSON.parse(data.content).tool;
      var devBundleDir = path.join(
        meteorToolDir,
        tool.split("@").slice(1).join("@"),
        "mt-" + getHostArch(),
        "dev_bundle"
      );

      if (finder.statOrNull(devBundleDir, "isDirectory")) {
        return devBundleDir;
      }
    }

    return null;

  }).catch(function (error) {
    console.error(error.stack || error);
    return null;
  });
}

function getHostArch() {
  if (process.platform === "win32") {
    return "os.windows.x86_32";
  }

  if (process.platform === "linux") {
    if (process.arch === "x64") {
      return "os.linux.x86_64";
    }
    return "os.linux.x86_32";
  }

  if (process.platform === "darwin") {
    return "os.osx.x86_64";
  }
}

module.exports = getDevBundleDir().catch(function (error) {
  return defaultDevBundlePromise;
});
