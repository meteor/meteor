var assert = require("assert");
var path = require("path");
var fs = require("fs");
var hasOwn = Object.hasOwnProperty;
var defaultHandler = require.extensions[".js"];
var convertSourceMap = require("convert-source-map");
var util = require("./util.js");

var config = {
  version: require("./package.json").version,
  cacheDir: process.env.BABEL_CACHE_DIR ||
    path.join(
      process.env.HOME || process.env.USERPROFILE || __dirname,
      ".babel-cache"
    ),
  babelOptions: require("./options").getDefaults({
    modules: true,
    meteorAsyncAwait: true
  })
};

// Reset to null in the reconfigure function below.
var cachedConfigHash = null;

exports = module.exports = function reconfigure(newConfig) {
  Object.keys(newConfig).forEach(function (key) {
    // Sanitize config values and prevent circular references.
    config[key] = JSON.parse(JSON.stringify(newConfig[key]));
  });

  // Force config properties to be rehashed next time (see below).
  cachedConfigHash = null;
};

require.extensions[".js"] = function(module, filename) {
  if (shouldNotTransform(filename)) {
    defaultHandler(module, filename);
  } else {
    module._compile(
      getBabelResult(filename).code,
      filename
    );
  }
};

exports.retrieveSourceMap = function(filename) {
  if (shouldNotTransform(filename)) {
    return null;
  }

  var result = getBabelResult(filename);
  var converted = result && convertSourceMap.fromSource(result.code);
  var map = converted && converted.toJSON();

  return map && {
    url: map.file,
    map: map
  } || null;
};

function shouldNotTransform(filename) {
  if (path.resolve(filename) !==
      path.normalize(filename)) {
    // If the filename is not absolute, then it's a file in a core Node
    // module, and should not be transformed.
    return true;
  }

  var relPath = path.relative(__dirname, filename);
  var firstPart = relPath.split(path.sep, 1)[0];
  var isExternal = firstPart === "..";

  if (isExternal) {
    // If the file is outside the meteor-babel directory, then ignore it
    // if it is contained by any node_modules ancestor directory.
    return filename.split(path.sep).indexOf("node_modules") >= 0;
  }

  // If the file is inside the meteor-babel directory, then ignore it only
  // if it is contained by the local meteor-babel/node_modules directory.
  return firstPart === "node_modules";
}

function getCache() {
  var cacheDir = config.cacheDir;

  if (! hasOwn.call(getCache, cacheDir)) {
    util.mkdirp(cacheDir);
    var cache = getCache[cacheDir] = {};

    fs.readdirSync(cacheDir).forEach(function (cacheFile) {
      if (/\.json$/.test(cacheFile)) {
        // Avoid actually reading the files until we know we need their
        // contents, but record the filename so that we can quickly check
        // whether a cached file exists on disk or not.
        cache[cacheFile] = true;
      }
    });
  }

  return getCache[cacheDir];
}

function getBabelResult(filename) {
  var source = fs.readFileSync(filename, "utf8");
  var cache = getCache();

  var configHash = cachedConfigHash || (
    cachedConfigHash = util.deepHash([
      // Since we make a defensive deep copy of new config properties, we
      // can avoid rehashing if we know they have not changed.
      config.version,
      config.babelOptions
    ])
  );

  var cacheFile = util.deepHash([
    // Though it's tempting to include babel.version in this hash, we
    // don't want to call require("babel") unless we really have to, and
    // the package version should be good enough, especially if we make it
    // identical to babel.version.
    configHash,
    filename,
    source
  ]) + ".json";
  var fullCacheFile = path.join(config.cacheDir, cacheFile);
  var result;

  if (hasOwn.call(cache, cacheFile)) {
    result = cache[cacheFile];
    if (result === true) {
      try {
        result = cache[cacheFile] = require(fullCacheFile);
      } catch (error) {
        fs.unlinkSync(fullCacheFile);
        result = cache[cacheFile] = false;

        if (error.message.indexOf("Unexpected end of input") >= 0) {
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

  if (typeof result !== "object") {
    if (config.babelOptions.sourceMap) {
      config.babelOptions.filename = filename;
      config.babelOptions.sourceFileName = filename;
      config.babelOptions.sourceMapName = filename + ".map";
    }

    result = cache[cacheFile] =
      require("babel-core").transform(source, config.babelOptions);

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

  var usedHelpers = result.metadata.usedHelpers;
  if (usedHelpers && usedHelpers.length > 0) {
    require("./index.js").installRuntime();
  }

  return result;
}
