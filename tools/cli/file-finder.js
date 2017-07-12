"use strict";

const path = require("path");
const fs = require("fs");
const rootDir = path.resolve(__dirname, "..", "..");

exports.findReleaseFile = function () {
  return find(
    process.cwd(),
    makeStatTest("isFile"),
    ".meteor", "release"
  );
};

exports.findLocalDir = function (releaseFile) {
  if (typeof releaseFile === "undefined") {
    releaseFile = exports.findReleaseFile();
  }

  if (! releaseFile) {
    return null;
  }

  let localDir = path.join(path.dirname(releaseFile), "local");
  if (! statOrNull(localDir, "isDirectory")) {
    try {
      fs.mkdirSync(localDir);
    } catch (e) {
      return null;
    }
  }

  return localDir;
};

exports.findPackageMetadataDir = function () {
  return find(
    rootDir,
    makeStatTest("isDirectory"),
    ".meteor", "package-metadata"
  );
};

exports.findMeteorToolDir = function (packageMetadataDir) {
  if (typeof packageMetadataDir === "undefined") {
    packageMetadataDir = exports.findPackageMetadataDir();
  }

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

  return meteorToolDir;
};

exports.findDbPath = function (packageMetadataDir) {
  if (typeof packageMetadataDir === "undefined") {
    packageMetadataDir = exports.findPackageMetadataDir();
  }

  if (! packageMetadataDir) {
    return null;
  }

  const dbPath = path.join(
    packageMetadataDir,
    "v2.0.1",
    "packages.data.db"
  );

  if (! statOrNull(dbPath, "isFile")) {
    return null;
  }

  return dbPath;
};

exports.findNodeModulesDotBinDirs = function () {
  const dirs = [];

  const releaseFile = exports.findReleaseFile();
  if (! releaseFile) {
    return dirs;
  }

  const rootAppDir = path.resolve(releaseFile, "..", "..");

  find(process.cwd(), dir => {
    const dotBinDir = path.join(dir, "node_modules", ".bin");
    if (statOrNull(dotBinDir, "isDirectory")) {
      dirs.push(dotBinDir);
    }

    return dir === rootAppDir;
  });

  return dirs;
};

function statOrNull(path, statMethod) {
  let stat;

  try {
    stat = fs.statSync(path);
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

exports.statOrNull = statOrNull;

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
