var fs = require("fs");
var files = require("../fs/mini-files.js");

exports.makeLink = function (target, linkPath) {
  target = files.convertToOSPath(target);
  linkPath = files.convertToOSPath(linkPath);

  var tempPath = linkPath + "-" + Math.random().toString(36).slice(2);

  try {
    fs.symlinkSync(target, tempPath, "junction");
  } catch (e) {
    fs.writeFileSync(tempPath, target, "utf8");
  }

  fs.renameSync(tempPath, linkPath);
};

exports.readLink = function (linkPath) {
  linkPath = files.convertToOSPath(linkPath);

  var stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
    linkPath = fs.realpathSync(linkPath);
  } else if (stat.isFile()) {
    linkPath = fs.readFileSync(linkPath, "utf8");
  }

  return files.convertToStandardPath(linkPath);
};
