var fs = require("fs");

exports.makeLink = function (target, linkPath) {
  var tempPath = linkPath + "-" + Math.random().toString(36).slice(2);

  try {
    fs.symlinkSync(target, tempPath, "junction");
  } catch (e) {
    fs.writeFileSync(tempPath, target, "utf8");
  }

  fs.renameSync(tempPath, linkPath);
};

exports.readLink = function (linkPath) {
  var stat = fs.lstatSync(linkPath);

  if (stat.isSymbolicLink()) {
    return fs.realpathSync(linkPath);
  }

  if (stat.isFile()) {
    return fs.readFileSync(linkPath, "utf8");
  }

  return linkPath;
};
