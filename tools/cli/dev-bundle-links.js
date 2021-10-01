const fs = require("fs");
const { convertToOSPath } = require("./convert-to-os-path.js");

exports.makeLink = function (target, linkPath) {
  target = convertToOSPath(target);
  linkPath = convertToOSPath(linkPath);

  var tempPath = linkPath + "-" + Math.random().toString(36).slice(2);

  try {
    fs.symlinkSync(target, tempPath, "junction");
  } catch (e) {
    fs.writeFileSync(tempPath, target, "utf8");
  }

  try {
    fs.renameSync(tempPath, linkPath);
  } catch (e) {
    // If renaming fails, try unlinking first.
    require("rimraf").sync(linkPath);
    fs.renameSync(tempPath, linkPath);
  }
};

// Note: this function returns an OS-specific path!
exports.readLink = function (linkPath) {
  linkPath = convertToOSPath(linkPath);

  var stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
    linkPath = fs.realpathSync(linkPath);
  } else if (stat.isFile()) {
    linkPath = fs.readFileSync(linkPath, "utf8");
  }

  return linkPath;
};
