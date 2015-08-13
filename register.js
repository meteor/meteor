var assert = require("assert");
var path = require("path");
var fs = require("fs");
var hasOwn = Object.hasOwnProperty;
var defaultHandler = require.extensions[".js"];
var convertSourceMap = require("convert-source-map");
var meteorBabel = require("./index.js");
var util = require("./util.js");

var config = {
  sourceMapRootPath: null,
  babelOptions: require("./options").getDefaults({
    modules: true,
    meteorAsyncAwait: true
  })
};

exports = module.exports = function reconfigure(newConfig) {
  Object.keys(newConfig).forEach(function (key) {
    // Sanitize config values and prevent circular references.
    config[key] = JSON.parse(JSON.stringify(newConfig[key]));
  });

  return reconfigure;
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

  // If the file is inside the meteor-babel directory, then transform it
  // only if it is contained by the test directory.
  return firstPart !== "test";
}

function getBabelResult(filename) {
  var source = fs.readFileSync(filename, "utf8");

  var babelOptions = {};
  for (var key in config.babelOptions) {
    if (hasOwn.call(config.babelOptions, key)) {
      babelOptions[key] = config.babelOptions[key];
    }
  }

  if (babelOptions.sourceMap) {
    if (config.sourceMapRootPath) {
      var relativePath = path.relative(
        config.sourceMapRootPath,
        filename
      );

      if (relativePath.slice(0, 2) !== "..") {
        // If the given filename is a path contained within
        // config.sourceMapRootPath, use the relative path but prepend a
        // '/' so that source maps work more reliably.
        filename = "/" + relativePath;
      }
    }

    babelOptions.filename = filename;
    babelOptions.sourceFileName = filename;
    babelOptions.sourceMapName = filename + ".map";
  }

  var result = meteorBabel.compile(source, babelOptions);

  var usedHelpers = result.metadata.usedHelpers;
  if (usedHelpers && usedHelpers.length > 0) {
    meteorBabel.installRuntime();
  }

  return result;
}
