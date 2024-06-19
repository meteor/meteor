// Note that this file is required before we install our Babel hooks in
// ../tool-env/install-babel.js, so we can't use ES2015+ syntax here.

// This file replicates some functionality from elsewhere in tools code,
// but that's unavoidable if we don't want to install Babel and load all
// the rest of the code every time we run `meteor npm` or `meteor node`.

var fs = require("fs");
var path = require("path");
var links = require("./dev-bundle-links.js");
var rootDir = path.resolve(__dirname, "..", "..");
var defaultDevBundlePromise =
  Promise.resolve(path.join(rootDir, "dev_bundle"));

async function getDevBundleDir() {
  // Note that this code does not care if we are running meteor from a
  // checkout, because it's always better to respect the .meteor/release
  // file of the current app, if possible.

  var releaseFile = find(
    process.cwd(),
    makeStatTest("isFile"),
    ".meteor", "release"
  );

  if (! releaseFile) {
    return defaultDevBundlePromise;
  }

  var localDir = path.join(path.dirname(releaseFile), "local");
  if (! statOrNull(localDir, "isDirectory")) {
    try {
      fs.mkdirSync(localDir);
    } catch (e) {
      return defaultDevBundlePromise;
    }
  }

  var devBundleLink = path.join(localDir, "dev_bundle");
  var devBundleStat = statOrNull(devBundleLink);
  if (devBundleStat) {
    return new Promise(function (resolve) {
      resolve(links.readLink(devBundleLink));
    });
  }

  var release = fs.readFileSync(
    releaseFile, "utf8"
  ).replace(/^\s+|\s+$/g, "");

  console.log({ release, releaseFile })

  if (! /^METEOR@\d+/.test(release)) {
    return defaultDevBundlePromise;
  }

  const devBundleDir = await getDevBundleForRelease(release);

  console.log({ devBundleDir, defaultDevBundlePromise })

  if (devBundleDir) {
    links.makeLink(devBundleDir, devBundleLink);
    return devBundleDir;
  }

  return defaultDevBundlePromise;
}

function getDevBundleForRelease(release) {
  var parts = release.split("@");
  if (parts.length < 2) {
    return null;
  }

  var track = parts[0];
  var version = parts.slice(1).join("@");

  var packageMetadataDir = find(
    rootDir,
    makeStatTest("isDirectory"),
    ".meteor", "package-metadata"
  );

  if (! packageMetadataDir) {
    return null;
  }

  var meteorToolDir = path.resolve(
    packageMetadataDir,
    "..", "packages", "meteor-tool"
  );

  var meteorToolStat = statOrNull(meteorToolDir, "isDirectory");
  if (! meteorToolStat) {
    return null;
  }

  var dbPath = path.join(
    packageMetadataDir,
    "v2.0.1",
    "packages.data.db"
  );

  var dbStat = statOrNull(dbPath, "isFile");
  if (! dbStat) {
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

      var devBundleStat = statOrNull(devBundleDir, "isDirectory");
      if (devBundleStat) {
        return devBundleDir;
      }
    }

    return null;

  }).catch(function (error) {
    console.error(error.stack || error);
    return null;
  });
}

function statOrNull(path, statMethod) {
  try {
    var stat = fs.statSync(path);
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw e;
    }
  }

  if (stat) {
    if (typeof statMethod === "string") {
      if (stat[statMethod]()) {
        return stat;
      }
    } else {
      return stat;
    }
  }

  return null;
}

function find(dir, predicate) {
  var joinArgs = Array.prototype.slice.call(arguments, 2);
  joinArgs.unshift(null);

  while (true) {
    joinArgs[0] = dir;
    var joined = path.join.apply(path, joinArgs);
    if (predicate(joined)) {
      return joined;
    }

    var parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }

  return null;
}

function makeStatTest(method) {
  return function (file) {
    return statOrNull(file, method);
  };
}

function getHostArch() {
  if (process.platform === "win32") {
    return "os.windows.x86_64";
  }

  if (process.platform === "linux") {
    return "os.linux.x86_64";
  }

  if (process.platform === "darwin") {
    return "os.osx.x86_64";
  }
}

module.exports = getDevBundleDir().catch(function (error) {
  return defaultDevBundlePromise;
});
