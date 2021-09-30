var assert = require("assert");
var path = require("path");
var fs = require("fs");
var util = require("./util.js");
var meteorBabelVersion = require("./package.json").version;
var reifyVersion = require("reify/package.json").version;
var hasOwn = Object.prototype.hasOwnProperty;

function Cache(fillFn, cacheDir) {
  assert.ok(this instanceof Cache);
  assert.strictEqual(typeof fillFn, "function");

  this.fillFn = fillFn;
  this.dir = ensureCacheDir(cacheDir);
  this.cache = this.loadCacheFromDisk(this.dir);
}

module.exports = Cache;

var Cp = Cache.prototype;

function ensureCacheDir(cacheDir) {
  cacheDir = path.resolve(
    cacheDir ||
    process.env.BABEL_CACHE_DIR ||
    path.join(
      process.env.HOME || process.env.USERPROFILE || __dirname,
      ".babel-cache"
    )
  );

  try {
    util.mkdirp(cacheDir);
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }

  return cacheDir;
}

Cp.loadCacheFromDisk = function () {
  var cache = {};

  fs.readdirSync(this.dir).forEach(function (cacheFile) {
    if (/\.json$/.test(cacheFile)) {
      // Avoid actually reading the files until we know we need their
      // contents, but record the filename so that we can quickly check
      // whether a cached file exists on disk or not.
      cache[cacheFile] = true;
    }
  });

  return cache;
};

Cp.get = function (source, options, deps) {
  var cacheHash;
  if (deps && deps.sourceHash) {
    cacheHash = util.deepHash(
      meteorBabelVersion, reifyVersion,
      options, deps
    );
  } else {
    cacheHash = util.deepHash(
      meteorBabelVersion, reifyVersion,
      source, options, deps
    );
  }
  
  var cacheFile = cacheHash + ".json";
  var fullCacheFile = path.join(this.dir, cacheFile);
  var result;

  if (hasOwn.call(this.cache, cacheFile)) {
    result = this.cache[cacheFile];

    if (result === true) {
      try {
        result = this.cache[cacheFile] = require(fullCacheFile);
      } catch (error) {
        fs.unlinkSync(fullCacheFile);
        result = this.cache[cacheFile] = false;

        if (/Unexpected end of (JSON )?input/.test(error.message)) {
          // The cache file was not written completely, probably because
          // we use the asynchronous version of fs.writeFile, and the
          // program exited too soon. Fall through to transform again.
        } else {
          // Some other problem occurred that we should know about.
          console.error(error.stack);
        }
      }
    }
  }

  if (typeof result === "object") {
    result.hash = cacheHash;
  } else {
    result = this.fillFn.call(null, source, options);
    if (! result) {
      return null;
    }

    this.cache[cacheFile] = result;
    result.hash = cacheHash;

    // Use the asynchronous version of fs.writeFile so that we don't slow
    // down require by waiting for cache files to be written.
    fs.writeFile(
      fullCacheFile,
      JSON.stringify(result) + "\n",
      { encoding: "utf8", flag: "wx" },
      function (error) {
        if (! error || error.code === "EEXIST") {
          // Opening the file with the exclusive (x) flag failed because
          // the file already existed, which is not a problem.
          return;
        }

        // Errors encountered while persisting cache files to disk will
        // not prevent the program from working, so should not be fatal.
        console.error(error.stack);
      }
    );
  }

  return result;
};
