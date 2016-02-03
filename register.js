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
  allowedDirectories: Object.create(null),
  babelOptions: require("./options").getDefaults()
};

exports.setSourceMapRootPath = function (smrp) {
  config.sourceMapRootPath = smrp;
  return exports;
};

exports.allowDirectory = function (dir) {
  config.allowedDirectories[dir] = true;
  return exports;
};

exports.setBabelOptions = function (options) {
  config.babelOptions = options;
  return exports;
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

  var dirs = Object.keys(config.allowedDirectories);
  var allowed = dirs.some(function (dir) {
    var relPath = path.relative(dir, filename);
    if (relPath.slice(0, 2) === "..") {
      // Ignore files that are not contained by an allowed directory.
      return false;
    }

    if (relPath.split(path.sep).indexOf("node_modules") >= 0) {
      // Ignore files that are contained by a node_modules directory that
      // is itself contained by the allowed dir.
      return false;
    }

    return true;
  });

  return ! allowed;
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
    babelOptions.sourceMapTarget = filename + ".map";
  }

  var result = meteorBabel.compile(source, babelOptions);

  require("./runtime.js");

  return result;
}
