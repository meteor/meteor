// Note that this file is required before we install our Babel hooks in
// ../tool-env/install-babel.js, so we can't use ES2015+ syntax here.

// This file replicates some functionality from elsewhere in tools code,
// but that's unavoidable if we don't want to install Babel and load all
// the rest of the code every time we run `meteor npm` or `meteor node`.

var fs = require("fs");
var path = require("path");
var rootDir = path.resolve(__dirname, "..", "..");
var defaultDevBundlePromise =
  Promise.resolve(path.join(rootDir, "dev_bundle"));

function getDevBundleDir() {
  var dotGitStat = statOrNull(
    path.join(rootDir, ".git"),
    "isDirectory"
  );

  if (dotGitStat) {
    return defaultDevBundlePromise;
  }

  var release = getReleaseForCurrentApp();
  if (release) {
    return getDevBundleForRelease(release);
  }

  return defaultDevBundlePromise;
}

function getReleaseForCurrentApp() {
  var releaseFile = find(
    process.cwd(),
    makeStatTest("isFile"),
    ".meteor", "release"
  );

  if (releaseFile) {
    var release = fs.readFileSync(
      releaseFile, "utf8"
    ).replace(/^\s+|\s+$/g, "");

    if (/^METEOR@\d+/.test(release)) {
      return release;
    }
  }
}

function getDevBundleForRelease(release) {
  var parts = release.split("@");
  if (parts.length < 2) {
    return defaultDevBundlePromise;
  }

  var track = parts[0];
  var version = parts.slice(1).join("@");

  var packageMetadataDir = find(
    rootDir,
    makeStatTest("isDirectory"),
    ".meteor", "package-metadata"
  );

  if (! packageMetadataDir) {
    return defaultDevBundlePromise;
  }

  var meteorToolDir = path.resolve(
    packageMetadataDir,
    "..", "packages", "meteor-tool"
  );

  var meteorToolStat = statOrNull(meteorToolDir, "isDirectory");
  if (! meteorToolStat) {
    return defaultDevBundlePromise;
  }

  var dbPath = path.join(
    packageMetadataDir,
    "v2.0.1",
    "packages.data.db"
  );

  var dbStat = statOrNull(dbPath, "isFile");
  if (! dbStat) {
    return defaultDevBundlePromise;
  }

  var sqlite3 = require("sqlite3");
  var db = new sqlite3.Database(dbPath);

  return new Promise(function (resolve, reject) {
    db.get(
      "SELECT content FROM releaseVersions WHERE track=? AND version=?",
      [track, version],
      function (error, data) {
        if (error) {
          reject(error);
        } else {
          var tool = JSON.parse(data.content).tool;
          var devBundleDir = path.join(
            meteorToolDir,
            tool.split("@").slice(1).join("@"),
            "mt-" + getHostArch(),
            "dev_bundle"
          );

          var devBundleStat = statOrNull(devBundleDir, "isDirectory");
          if (devBundleStat) {
            console.log(devBundleDir);
            resolve(devBundleDir);
          } else {
            resolve(defaultDevBundlePromise);
          }
        }
      }
    );
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

module.exports = getDevBundleDir();
