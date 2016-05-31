var fs = require("fs");
var path = require("path");
var createHash = require("crypto").createHash;
var assert = require("assert");

exports.mkdirp = function mkdirp(dir) {
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
};

function deepHash(val) {
  return createHash("sha1")
    .update(JSON.stringify(val))
    .digest("hex");
}

exports.deepHash = function (val) {
  var argc = arguments.length;
  if (argc === 1) {
    return deepHash(val);
  }

  var args = new Array(argc);
  for (var i = 0; i < argc; ++i) {
    args[i] = arguments[i];
  }

  return deepHash(args);
};
