// Note that this file is required before we install our Babel hooks in
// ../tool-env/install-babel.js, so we can't use ES2015+ syntax here.

// This file replicates some functionality from elsewhere in tools code,
// but that's unavoidable if we don't want to install Babel and load all
// the rest of the code every time we run `meteor npm` or `meteor node`.

const fs = require("fs");
const path = require("path");
const links = require("./dev-bundle-links.js");
const rootDir = path.resolve(__dirname, "..", "..");

const DEFAULT_DEV_BUNDLE_DIR = path.join(rootDir, "dev_bundle");

async function getDevBundleDir() {
  // Note that this code does not care if we are running meteor from a
  // checkout, because it's always better to respect the .meteor/release
  // file of the current app, if possible.

  const releaseFile = find(
    process.cwd(),
    makeStatTest("isFile"),
    ".meteor", "release"
  );

  if (! releaseFile) {
    return DEFAULT_DEV_BUNDLE_DIR;
  }

  const localDir = path.join(path.dirname(releaseFile), "local");
  if (! statOrNull(localDir, "isDirectory")) {
    try {
      fs.mkdirSync(localDir);
    } catch (e) {
      return DEFAULT_DEV_BUNDLE_DIR;
    }
  }

  const devBundleLink = path.join(localDir, "dev_bundle");
  const devBundleStat = statOrNull(devBundleLink);
  if (devBundleStat) {
    return new Promise(function (resolve) {
      resolve(links.readLink(devBundleLink));
    });
  }

  const release = fs.readFileSync(
    releaseFile, "utf8"
  ).replace(/^\s+|\s+$/g, "");

  if (! /^METEOR@\d+/.test(release)) {
    return DEFAULT_DEV_BUNDLE_DIR;
  }

  const devBundleDir = await getDevBundleForRelease(release);

  if (devBundleDir) {
    links.makeLink(devBundleDir, devBundleLink);
    return devBundleDir;
  }

  return DEFAULT_DEV_BUNDLE_DIR;
}

function getDevBundleForRelease(release) {
  const parts = release.split("@");
  if (parts.length < 2) {
    return null;
  }

  const track = parts[0];
  const version = parts.slice(1).join("@");

  const packageMetadataDir = find(
    rootDir,
    makeStatTest("isDirectory"),
    ".meteor", "package-metadata"
  );

  if (! packageMetadataDir) {
    return null;
  }

  const meteorToolDir = path.resolve(
    packageMetadataDir,
    "..", "packages", "meteor-tool"
  );

  const meteorToolStat = statOrNull(meteorToolDir, "isDirectory");
  if (! meteorToolStat) {
    return null;
  }

  const dbPath = path.join(
    packageMetadataDir,
    "v2.0.1",
    "packages.data.db"
  );

  const dbStat = statOrNull(dbPath, "isFile");
  if (! dbStat) {
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

      const devBundleStat = statOrNull(devBundleDir, "isDirectory");
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
  const joinArgs = Array.prototype.slice.call(arguments, 2);
  joinArgs.unshift(null);

  while (true) {
    joinArgs[0] = dir;
    const joined = path.join.apply(path, joinArgs);
    if (predicate(joined)) {
      return joined;
    }

    const parentDir = path.dirname(dir);
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

module.exports = {
  getDevBundleDir,
  DEFAULT_DEV_BUNDLE_DIR
}