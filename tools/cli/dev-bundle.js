// Note that this file is required before we install our Babel hooks in
// ../tool-env/install-babel.js, so we can't use ES2015+ syntax here.

// This file replicates some functionality from elsewhere in tools code,
// but that's unavoidable if we don't want to install Babel and load all
// the rest of the code every time we run `meteor npm` or `meteor node`.

"use strict";

const fs = require("fs");
const path = require("path");
const links = require("./dev-bundle-links.js");
const finder = require("./file-finder.js");
const rootDir = path.resolve(__dirname, "..", "..");
const defaultDevBundlePromise =
  Promise.resolve(path.join(rootDir, "dev_bundle"));

function getDevBundleDir() {
  // Note that this code does not care if we are running meteor from a
  // checkout, because it's always better to respect the .meteor/release
  // file of the current app, if possible.

  const releaseFile = finder.findReleaseFile();
  if (! releaseFile) {
    return defaultDevBundlePromise;
  }

  const localDir = finder.findLocalDir(releaseFile);
  if (! localDir) {
    return defaultDevBundlePromise;
  }

  const devBundleLink = path.join(localDir, "dev_bundle");
  if (finder.statOrNull(devBundleLink)) {
    return new Promise(function (resolve) {
      resolve(links.readLink(devBundleLink));
    });
  }

  const release = fs.readFileSync(
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
  const parts = release.split("@");
  if (parts.length < 2) {
    return null;
  }

  const track = parts[0];
  const version = parts.slice(1).join("@");

  const packageMetadataDir = finder.findPackageMetadataDir();
  if (! packageMetadataDir) {
    return null;
  }

  const meteorToolDir = finder.findMeteorToolDir(packageMetadataDir);
  if (! meteorToolDir) {
    return null;
  }

  const dbPath = finder.findDbPath(packageMetadataDir);
  if (! meteorToolDir) {
    return null;
  }

  const sqlite3 = require("sqlite3");
  const db = new sqlite3.Database(dbPath);

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
      const tool = JSON.parse(data.content).tool;
      const devBundleDir = path.join(
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
