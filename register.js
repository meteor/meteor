var assert = require("assert");
var path = require("path");
var fs = require("fs");
var hasOwn = Object.hasOwnProperty;
var defaultHandler = require.extensions[".js"];

var config = {
  version: require("./package.json").version,
  cacheDir: process.env.BABEL_CACHE_DIR ||
    path.join(
      process.env.HOME || process.env.USERPROFILE || __dirname,
      ".babel-cache"
    ),
  babelOptions: require("./options").getDefaults()
};

module.exports = function reconfigure(newConfig) {
  Object.keys(newConfig).forEach(function (key) {
    config[key] = newConfig[key];
  });
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

function shouldNotTransform(filename) {
  if (path.resolve(filename) !==
      path.normalize(filename)) {
    return true;
  }

  return path.relative(__dirname, filename)
    .split(path.sep)
    .indexOf("node_modules") >= 0;
}

function getCache() {
  var cacheDir = config.cacheDir;

  if (! hasOwn.call(getCache, cacheDir)) {
    mkdirp(cacheDir);
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

function mkdirp(dir) {
  if (! fs.existsSync(dir)) {
    var parentDir = path.dirname(dir);
    if (parentDir !== dir) {
      mkdirp(parentDir);
    }

    try {
      fs.mkdirSync(dir);
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
  }

  return dir;
}

function getBabelResult(filename) {
  var source = fs.readFileSync(filename, "utf8");
  var cache = getCache();
  var cacheFile = deepHash([
    // Though it's tempting to include babel.version in this hash, we
    // don't want to call require("babel") unless we really have to, and
    // the package version should be good enough, especially if we make it
    // identical to babel.version.
    config.version,
    config.babelOptions,
    filename,
    source
  ]) + ".json";
  var result;

  if (hasOwn.call(cache, cacheFile)) {
    result = cache[cacheFile];
    if (result === true) {
      try {
        result = cache[cacheFile] =
          require(path.join(config.cacheDir, cacheFile));
      } catch (error) {
        console.error(error.stack);
        // Fall through to re-transform the file below.
      }
    }
  }

  if (! result) {
    if (config.babelOptions.sourceMap) {
      config.babelOptions.sourceFileName = filename;
    }

    result = cache[cacheFile] =
      require("babel-core").transform(source, config.babelOptions);

    // Use the asynchronous version of fs.writeFile so that we don't slow
    // down require by waiting for cache files to be written.
    fs.writeFile(
      path.join(config.cacheDir, cacheFile),
      JSON.stringify(result) + "\n",
      { encoding: "utf8", flag: "wx" },
      function (error) {
        if (error.code === "EEXIST") {
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
    require("babel-core/external-helpers");
  }

  return result;
}

// Borrowed from another MIT-licensed project that I wrote:
// https://github.com/reactjs/commoner/blob/235d54a12c/lib/util.js#L136-L168
function deepHash(val) {
  var hash = require("crypto").createHash("sha1");
  var type = typeof val;

  if (val === null) {
    type = "null";
  }

  switch (type) {
  case "object":
    var keys = Object.keys(val);

    // Array keys will already be sorted.
    if (! Array.isArray(val)) {
      keys.sort();
    }

    keys.forEach(function(key) {
      if (typeof val[key] === "function") {
        // Silently ignore nested methods, but nevertheless complain below
        // if the root value is a function.
        return;
      }

      hash.update(key + "\0").update(deepHash(val[key]));
    });

    break;

  case "function":
    assert.ok(false, "cannot hash function objects");
    break;

  default:
    hash.update("" + val);
    break;
  }

  return hash.digest("hex");
}
