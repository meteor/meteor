var path = require("path");
var fs = require("fs");
var babelOptions = require("./options");
var hasOwn = Object.hasOwnProperty;
var defaultHandler = require.extensions[".js"];

// TODO Make sure this directory is writable.
var cacheDir = path.join(__dirname, ".result-cache");

function shouldNotTransform(filename) {
  return path.relative(__dirname, filename)
    .split(path.sep)
    .indexOf("node_modules") >= 0;
}

function getCache() {
  if (! hasOwn.call(getCache, "_cache")) {
    if (! fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir);
    }

    getCache._cache = {};

    fs.readdirSync(cacheDir).forEach(function (cacheFile) {
      if (/\.json$/.test(cacheFile)) {
        // Avoid actually reading the files until we know we need their
        // contents, but record the filename so that we can quickly check
        // whether a cached file exists on disk or not.
        getCache._cache[cacheFile] = true;
      }
    });
  }

  return getCache._cache;
}

require.extensions[".js"] = function(module, filename) {
  if (shouldNotTransform(filename)) {
    defaultHandler(module, filename);
  } else {
    babelHandler(module, filename);
  }
};

function babelHandler(module, filename) {
  var source = fs.readFileSync(filename, "utf8");
  var cache = getCache();
  var cacheFile = deepHash([
    filename,
    // Though it's tempting to include babel.version in this hash, we
    // don't want to call require("babel") unless we really have to, and
    // the package version should be good enough, especially if we make it
    // identical to babel.version.
    require("./package.json").version,
    babelOptions,
    source
  ]) + ".json";
  var result;

  if (hasOwn.call(cache, cacheFile)) {
    result = cache[cacheFile];
    if (result === true) {
      try {
        result = cache[cacheFile] =
          require(path.join(cacheDir, cacheFile));
      } catch (error) {
        console.error(error.stack);
      }
    }
  }

  if (! result) {
    result = cache[cacheFile] =
      require("babel-core").transform(source, babelOptions);

    // Use the asynchronous version of fs.writeFile so that we don't slow
    // down require by waiting for cache files to be written.
    fs.writeFile(
      path.join(cacheDir, cacheFile),
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

  module._compile(result.code, filename);
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
    Object.keys(val).sort().forEach(function(key) {
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
