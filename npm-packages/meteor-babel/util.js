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

exports.deepClone = function (val) {
  return deepCloneHelper(val, new Map);
};

function deepCloneHelper(val, seen) {
  if (seen.has(val)) {
    return seen.get(val);
  }

  if (Array.isArray(val)) {
    const copy = new Array(val.length);
    seen.set(val, copy);
    val.forEach(function (child, i) {
      copy[i] = deepCloneHelper(child, seen);
    });
    return copy;
  }

  if (val !== null && typeof val === "object") {
    const copy = Object.create(Object.getPrototypeOf(val));
    seen.set(val, copy);

    const handleKey = function (key) {
      const desc = Object.getOwnPropertyDescriptor(val, key);
      desc.value = deepCloneHelper(val[key], seen);
      Object.defineProperty(copy, key, desc);
    };

    Object.getOwnPropertyNames(val).forEach(handleKey);
    Object.getOwnPropertySymbols(val).forEach(handleKey);

    return copy;
  }

  return val;
}

function deepHash(val) {
  return createHash("sha1").update(
    JSON.stringify(val, function (key, value) {
      switch (typeof value) {
      case "function": return String(value);
      default: return value;
      }
    })
  ).digest("hex");
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
