var assert = require("assert");
var path = require("path");
var fs = require("fs");
var hasOwn = Object.hasOwnProperty;
var convertSourceMap = require("convert-source-map");
var meteorBabel = require("./index.js");
var util = require("./util.js");

var Module = module.constructor;
require("reify/lib/runtime").enable(Module.prototype);

var config = {
  sourceMapRootPath: null,
  allowedDirectories: Object.create(null),
  babelOptions: null
};

function setBabelOptions(options) {
  config.babelOptions = Object.assign({}, options, {
    // Overrides for default options:
    sourceMap: "inline"
  });
  return exports;
}

// Set default config.babelOptions.
setBabelOptions(require("./options.js").getDefaults({
  nodeMajorVersion: parseInt(process.versions.node)
}));

exports.setBabelOptions = setBabelOptions;

exports.setSourceMapRootPath = function (smrp) {
  config.sourceMapRootPath = smrp;
  return exports;
};

exports.allowDirectory = function (dir) {
  config.allowedDirectories[dir] = true;
  // Sometimes the filename passed to the require.extensions handler is a
  // real path, and thus may not appear to be contained by an allowed
  // directory, even though it should be.
  config.allowedDirectories[fs.realpathSync(dir)] = true;
  return exports;
};

var defaultHandler = require.extensions[".js"];
require.extensions[".js"] = function(module, filename) {
  if (shouldNotTransform(filename)) {
    defaultHandler(module, filename);
  } else {
    module._compile(
      getBabelResult(filename).code,
      filename
    );

    // As of version 0.10.0, the Reify require.extensions[".js"] handler
    // is responsible for running parent setters after the module has
    // finished loading for the first time, so we need to call that method
    // here because we are not calling the defaultHandler.
    module.runSetters();
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

    babelOptions.sourceFileName = filename;
    babelOptions.sourceMapTarget = filename + ".map";
  }

  babelOptions.filename = filename;

  return meteorBabel.compile(source, babelOptions);
}
